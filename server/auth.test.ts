import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as client } from 'socket.io-client';
import { tokenMatches, listenHost, requireApiToken, requireSocketToken } from './auth';

const token = 'test-only-personal-token';

test('token comparison rejects missing, malformed and incorrect credentials', () => {
  for (const candidate of [undefined, null, {}, '', 'wrong', 'x'.repeat(5000)]) {
    assert.equal(tokenMatches(token, candidate), false);
  }
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches('', undefined), true);
});

test('public binding requires a token; unconfigured production fails closed', () => {
  assert.equal(listenHost('', false), '127.0.0.1');
  assert.equal(listenHost(token, true), '0.0.0.0');
  assert.throws(() => listenHost('', true), /KONKLANCER_API_TOKEN/);
});

test('API and Socket.io require authentication, while the login page is public', async () => {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  io.use(requireSocketToken(token));
  app.use('/api', requireApiToken(token));
  app.get('/api/jobs', (_req, res) => res.json({ jobs: [] }));
  app.post('/api/action', (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.send('login'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal((await fetch(url)).status, 200);
    for (const authorization of ['', 'Bearer wrong', 'Basic test', `Bearer ${token} extra`]) {
      assert.equal((await fetch(`${url}/api/jobs`, { headers: { authorization } })).status, 401);
    }
    assert.equal((await fetch(`${url}/api/action`, { method: 'POST' })).status, 401);
    const good = await fetch(`${url}/api/jobs`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(good.status, 200);
    assert.equal(good.headers.get('cache-control'), 'no-store');
    for (const transport of ['polling', 'websocket']) {
      for (const credential of ['', 'wrong', token]) {
        await new Promise<void>((resolve, reject) => {
          const socket = client(url, { transports: [transport], auth: { token: credential }, reconnection: false });
          const timeout = setTimeout(() => { socket.disconnect(); reject(new Error('Socket auth timeout')); }, 3000);
          const finish = (allowed: boolean) => {
            clearTimeout(timeout);
            socket.disconnect();
            try { assert.equal(allowed, credential === token); resolve(); } catch (error) { reject(error); }
          };
          socket.on('connect', () => finish(true));
          socket.on('connect_error', () => finish(false));
        });
      }
    }
  } finally {
    await new Promise<void>(resolve => io.close(() => resolve()));
  }
});
