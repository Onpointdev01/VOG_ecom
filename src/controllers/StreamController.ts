import { controller, httpGet, request, response } from 'inversify-express-utils';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config';
import { streamController } from '../realtime/StreamController';

@controller('/api/v1/stream')
export class StreamHttpController {
  /**
   * Server-Sent Events endpoint.
   * Accepts ?token=<JWT>&lastEventId=<id>
   */
  @httpGet('/events')
  public events(@request() req: Request, @response() res: Response) {
    // 1) Auth: token in query OR Authorization header
    const qToken = (req.query.token as string) || '';
    const hToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const token = (qToken || hToken || '').trim();

    if (!token) {
      res.status(401).json({ status: 'error', message: 'Missing token' });
      return;
    }

    let userId = '';
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { id?: string; _id?: string };
      userId = String(payload.id || payload._id || '');
      if (!userId) throw new Error('no id');
    } catch {
      res.status(401).json({ status: 'error', message: 'Invalid token' });
      return;
    }

    // 2) Standard SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // @ts-ignore
    res.flushHeaders?.();

    // 3) If client sent a lastEventId, you could replay missed events here (optional)
    // const lastEventId = (req.query.lastEventId as string) || req.header('Last-Event-ID');

    // 4) Register client; keep the connection alive; clean up on close
    const cleanup = streamController.addClient(userId, res);

    // 5) Optional initial hello
    try {
      res.write(`event: ping\n`);
      res.write(`data: {"ok":true,"connected":${JSON.stringify(new Date().toISOString())}}\n\n`);
    } catch {}

    req.on('close', cleanup);
    req.on('error', cleanup);
  }
}
