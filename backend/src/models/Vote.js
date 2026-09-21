import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema(
  {
    poll_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Poll',
      required: true
    },
    option_id: {
      type: String,
      required: true
    },
    voter_identifier: {
      type: String,
      required: true
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      }
    }
  }
);

// Indexes matching init-mongo.js
voteSchema.index({ poll_id: 1, option_id: 1 }, { name: 'idx_votes_poll_option' });
voteSchema.index({ poll_id: 1, voter_identifier: 1 }, { unique: true, name: 'idx_votes_poll_voter_unique' });

export const Vote = mongoose.model('Vote', voteSchema, 'votes');
