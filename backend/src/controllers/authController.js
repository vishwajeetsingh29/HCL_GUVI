import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { generateToken } from '../middleware/auth.js';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export async function signup(req, res) {
  try {
    let { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    name = String(name).trim();
    email = String(email).trim().toLowerCase();
    password = String(password);

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    if (password.length < 6 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be between 6 and 72 characters' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password_hash: passwordHash,
      created_at: new Date()
    });

    await user.save();

    const token = generateToken(user._id.toString(), user.email);

    return res.status(201).json({
      token,
      user: user.toJSON()
    });
  } catch (err) {
    console.error('Error during signup:', err);
    if (err.name === 'ValidationError' || err.code === 121) {
      return res.status(400).json({ error: 'User details failed validation. Name must be at least 2 characters.' });
    }
    return res.status(500).json({ error: 'Failed to create user record' });
  }
}

export async function login(req, res) {
  try {
    let { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    email = String(email).trim().toLowerCase();
    password = String(password);

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user._id.toString(), user.email);

    return res.status(200).json({
      token,
      user: user.toJSON()
    });
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ error: 'Database lookup failed' });
  }
}

export async function me(req, res) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user.toJSON());
  } catch (err) {
    console.error('Error retrieving user profile:', err);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
}
