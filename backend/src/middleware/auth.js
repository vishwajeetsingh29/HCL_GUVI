import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function generateToken(userId, email) {
  return jwt.sign(
    {
      user_id: userId,
      email: email,
      sub: userId
    },
    config.jwtSecret,
    {
      expiresIn: '72h',
      algorithm: 'HS256'
    }
  );
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is required' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({ error: 'Authorization format must be Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.userId = decoded.user_id || decoded.sub;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
