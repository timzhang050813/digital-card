import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'digital_card_token';
const isProduction = process.env.NODE_ENV === 'production';

function secret() {
  return process.env.JWT_SECRET || 'local-development-secret-change-before-production';
}

export function issueAuthCookie(res, user) {
  const token = jwt.sign(
    { sub: String(user.id), email: user.email },
    secret(),
    { expiresIn: '7d' },
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  });
}

export function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: '请先登录' });

  try {
    req.user = jwt.verify(token, secret());
    next();
  } catch {
    clearAuthCookie(res);
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

