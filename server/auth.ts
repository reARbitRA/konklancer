// SPEC-003 R5: one personal service token, never included in the client bundle.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Socket } from 'socket.io';

export function tokenMatches(expected: string, provided: unknown): boolean {
  if (!expected) return true; // only safe on the loopback binding below
  if (typeof provided !== 'string' || !provided || provided.length > 4096) return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(expected), hash(provided));
}

export function listenHost(token: string, production: boolean): string {
  if (token) return '0.0.0.0';
  if (production) throw new Error('KONKLANCER_API_TOKEN is required in production.');
  return '127.0.0.1';
}

export function requireApiToken(token: string): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '');
    if (!tokenMatches(token, match?.[1])) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'رمز ورود شخصی لازم است.' });
      return;
    }
    next();
  };
}

export function requireSocketToken(token: string) {
  return (socket: Socket, next: (error?: Error) => void) => {
    if (!tokenMatches(token, socket.handshake.auth?.token)) {
      next(new Error('AUTH_REQUIRED'));
      return;
    }
    next();
  };
}
