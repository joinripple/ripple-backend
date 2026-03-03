import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../utils/supabase';

// Extends Express Request with authenticated user info
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/**
 * Middleware: requires a valid Supabase access token in Authorization header.
 * Attaches userId and userEmail to the request object.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      data: null,
      error: { message: 'Missing authorization token', code: 'UNAUTHORIZED' },
    });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        data: null,
        error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      });
    }

    req.userId = user.id;
    req.userEmail = user.email;
    next();
  } catch (err) {
    return res.status(500).json({
      data: null,
      error: { message: 'Auth verification failed', code: 'INTERNAL_ERROR' },
    });
  }
}
