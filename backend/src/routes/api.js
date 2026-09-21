import express from 'express';
import { signup, login, me } from '../controllers/authController.js';
import {
  createPoll,
  getPoll,
  listUserPolls,
  castVote,
  deletePoll
} from '../controllers/pollController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// --- Auth Routes ---
router.post('/auth/signup', signup);
router.post('/auth/login', login);
router.get('/auth/me', authMiddleware, me);

// --- Poll Routes ---
// Note: '/polls/user' is placed before '/polls/:id' so 'user' is not captured as an id parameter
router.post('/polls', authMiddleware, createPoll);
router.get('/polls/user', authMiddleware, listUserPolls);
router.get('/polls/:id', getPoll);
router.post('/polls/:id/vote', castVote);
router.delete('/polls/:id', authMiddleware, deletePoll);

export default router;
