import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export function generateAccessToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role, orgId: user.orgId },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.ACCESS_TOKEN_EXPIRES }
  );
}

export function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user._id },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.REFRESH_TOKEN_EXPIRES }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.JWT_REFRESH_SECRET);
}

const isProd = config.NODE_ENV === 'production';

export function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge:   14 * 24 * 60 * 60 * 1000,
    path:     '/auth',
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    path:     '/auth',
  });
}
