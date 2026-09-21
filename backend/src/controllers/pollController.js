import crypto from 'crypto';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Poll } from '../models/Poll.js';
import { User } from '../models/User.js';
import { Vote } from '../models/Vote.js';
import { redisPublisher } from '../database/redis.js';
import { broadcastPollUpdate } from '../websocket/hub.js';

const POLL_UPDATES_CHANNEL = 'channel:poll_updates';

export async function createPoll(req, res) {
  try {
    const { question, options } = req.body || {};

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }

    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 5 || trimmedQuestion.length > 300) {
      return res.status(400).json({ error: 'Question must be between 5 and 300 characters long' });
    }

    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'A poll must have at least 2 options' });
    }

    if (options.length > 10) {
      return res.status(400).json({ error: 'A poll cannot have more than 10 options' });
    }

    const seen = new Set();
    const formattedOptions = [];

    for (const opt of options) {
      const trimmedOpt = String(opt || '').trim();
      if (!trimmedOpt) {
        return res.status(400).json({ error: 'Poll options cannot be empty' });
      }
      if (trimmedOpt.length > 200) {
        return res.status(400).json({ error: 'Each option must not exceed 200 characters' });
      }
      const lower = trimmedOpt.toLowerCase();
      if (seen.has(lower)) {
        return res.status(400).json({ error: 'Poll options must be distinct' });
      }
      seen.add(lower);

      formattedOptions.push({
        id: uuidv4(),
        text: trimmedOpt,
        vote_count: 0
      });
    }

    // Lookup creator name
    let creatorName = '';
    const user = await User.findById(req.userId);
    if (user) {
      creatorName = user.name;
    }

    const now = new Date();
    const poll = new Poll({
      creator_id: req.userId,
      creator_name: creatorName,
      question: trimmedQuestion,
      options: formattedOptions,
      total_votes: 0,
      status: 'active',
      created_at: now,
      updated_at: now
    });

    await poll.save();

    return res.status(201).json(poll.toJSON());
  } catch (err) {
    console.error('Error creating poll:', err);
    return res.status(500).json({ error: 'Failed to create poll in database' });
  }
}

export async function getPoll(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid poll ID format' });
    }

    const poll = await Poll.findById(id);
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    return res.status(200).json(poll.toJSON());
  } catch (err) {
    console.error('Error retrieving poll:', err);
    return res.status(500).json({ error: 'Database error retrieving poll' });
  }
}

export async function listUserPolls(req, res) {
  try {
    const polls = await Poll.find({ creator_id: req.userId }).sort({ created_at: -1 });
    return res.status(200).json(polls.map((p) => p.toJSON()));
  } catch (err) {
    console.error('Error listing user polls:', err);
    return res.status(500).json({ error: 'Failed to query user polls' });
  }
}

export async function castVote(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid poll ID format' });
    }

    let { option_id } = req.body || {};
    if (!option_id || typeof option_id !== 'string') {
      return res.status(400).json({ error: 'Option ID is required' });
    }
    option_id = option_id.trim();

    // 1. Verify poll exists and is active
    const poll = await Poll.findById(id);
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    if (poll.status !== 'active') {
      return res.status(400).json({ error: 'This poll is closed and no longer accepting votes' });
    }

    // 2. Validate option exists in this poll
    const optionExists = poll.options.some((opt) => opt.id === option_id);
    if (!optionExists) {
      return res.status(400).json({ error: 'Selected option does not belong to this poll' });
    }

    // 3. Generate voter fingerprint to prevent duplicate votes
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const customFingerprint = req.headers['x-voter-fingerprint'] || '';
    const voterRaw = `${clientIP}-${userAgent}-${customFingerprint}`;
    const voterHash = crypto.createHash('sha256').update(voterRaw).digest('hex');

    // Check if duplicate vote exists
    const existingVote = await Vote.findOne({
      poll_id: poll._id,
      voter_identifier: voterHash
    });

    if (existingVote) {
      return res.status(409).json({ error: 'You have already cast your vote in this poll' });
    }

    // 4. Save vote record
    try {
      const voteRecord = new Vote({
        poll_id: poll._id,
        option_id,
        voter_identifier: voterHash,
        created_at: new Date()
      });
      await voteRecord.save();
    } catch (saveErr) {
      // Duplicate key error code 11000
      if (saveErr.code === 11000) {
        return res.status(409).json({ error: 'You have already cast your vote in this poll' });
      }
      throw saveErr;
    }

    // 5. Atomically increment option vote count and total votes
    const updatedPoll = await Poll.findOneAndUpdate(
      { _id: poll._id, 'options.id': option_id },
      {
        $inc: {
          'options.$.vote_count': 1,
          total_votes: 1
        },
        $set: {
          updated_at: new Date()
        }
      },
      { new: true }
    );

    if (!updatedPoll) {
      return res.status(500).json({ error: 'Failed to update poll tally' });
    }

    const pollResponse = updatedPoll.toJSON();

    // 6. Broadcast event
    const liveMsg = {
      type: 'poll_update',
      poll_id: pollResponse.id,
      question: pollResponse.question,
      options: pollResponse.options,
      total_votes: pollResponse.total_votes,
      timestamp: new Date().toISOString()
    };

    // Publish to Redis channel for multi-instance scaling
    if (redisPublisher && redisPublisher.status === 'ready') {
      try {
        await redisPublisher.publish(POLL_UPDATES_CHANNEL, JSON.stringify(liveMsg));
      } catch (redisErr) {
        console.warn('Warning: Failed to publish live update to Redis:', redisErr.message);
        // Fallback to local WebSocket broadcast
        broadcastPollUpdate(pollResponse.id, liveMsg);
      }
    } else {
      // Local broadcast fallback if Redis is unavailable
      broadcastPollUpdate(pollResponse.id, liveMsg);
    }

    return res.status(200).json({
      message: 'Vote successfully recorded',
      poll: pollResponse
    });
  } catch (err) {
    console.error('Error casting vote:', err);
    return res.status(500).json({ error: 'Failed to record vote' });
  }
}

export async function deletePoll(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid poll ID format' });
    }

    const result = await Poll.deleteOne({
      _id: id,
      creator_id: req.userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Poll not found or you do not have permission to delete it' });
    }

    // Clean up associated votes
    await Vote.deleteMany({ poll_id: id }).catch((err) => {
      console.warn('Warning: Failed to clean up votes for deleted poll:', err.message);
    });

    return res.status(200).json({ message: 'Poll deleted successfully' });
  } catch (err) {
    console.error('Error deleting poll:', err);
    return res.status(500).json({ error: 'Failed to delete poll' });
  }
}
