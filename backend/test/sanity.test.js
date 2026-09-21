import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { generateToken } from '../src/middleware/auth.js';
import { User } from '../src/models/User.js';
import { Poll } from '../src/models/Poll.js';
import { Vote } from '../src/models/Vote.js';
import { config } from '../src/config/index.js';
import jwt from 'jsonwebtoken';

test('JWT Generation and Verification', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const email = 'tester@example.com';
  const token = generateToken(userId, email);

  assert.ok(typeof token === 'string' && token.length > 20);

  const decoded = jwt.verify(token, config.jwtSecret);
  assert.equal(decoded.user_id, userId);
  assert.equal(decoded.email, email);
  assert.equal(decoded.sub, userId);
});

test('User Model JSON serialization', async () => {
  const user = new User({
    name: 'Alice Cooper',
    email: 'alice@example.com',
    password_hash: await bcrypt.hash('secretPass123', 10),
    created_at: new Date()
  });

  const json = user.toJSON();
  assert.ok(json.id, 'User json must have id');
  assert.equal(json._id, undefined, '_id should be stripped in favor of id');
  assert.equal(json.password_hash, undefined, 'password_hash should not be exposed');
  assert.equal(json.name, 'Alice Cooper');
  assert.equal(json.email, 'alice@example.com');
  assert.ok(await user.comparePassword('secretPass123'));
  assert.ok(!(await user.comparePassword('wrongPass')));
});

test('Poll Model JSON serialization and validation', () => {
  const creatorId = new mongoose.Types.ObjectId();
  const poll = new Poll({
    creator_id: creatorId,
    creator_name: 'Bob',
    question: 'What is your favorite runtime?',
    options: [
      { text: 'Node.js', vote_count: 0 },
      { text: 'Go', vote_count: 0 }
    ],
    status: 'active',
    total_votes: 0
  });

  const json = poll.toJSON();
  assert.ok(json.id, 'Poll json must have id');
  assert.equal(json._id, undefined, '_id should be stripped in favor of id');
  assert.equal(json.question, 'What is your favorite runtime?');
  assert.equal(json.options.length, 2);
  assert.ok(json.options[0].id, 'Option must have auto-generated uuid id');
  assert.equal(json.options[0].text, 'Node.js');
  assert.equal(json.options[0].vote_count, 0);
  assert.equal(json.status, 'active');
});

test('Voter fingerprint hashing', () => {
  const ip = '192.168.1.100';
  const ua = 'Mozilla/5.0';
  const fp = 'voter_xyz123';
  const raw = `${ip}-${ua}-${fp}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 64);

  // Same inputs yield same hash
  const hash2 = crypto.createHash('sha256').update(raw).digest('hex');
  assert.equal(hash, hash2);
});
