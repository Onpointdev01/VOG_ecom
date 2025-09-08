// src/controllers/StreamController.ts
import { controller, httpGet, response } from 'inversify-express-utils';
import type { Response } from 'express';
import TYPES from '../di';
import { BaseController } from './BaseController';
import { streamController } from '../realtime/StreamController';

@controller('/api/v1/stream')
export class SSEController extends BaseController {
  // NOTE: path matches app.ts SSE_PATH = '/api/v1/stream/events'
  @httpGet('/events', TYPES.RequireSignIn)
  public open(@response() res: Response) {
    // Your auth middleware should have put the user (or id) here
    const u = (res.locals as any).user;
    const userId = typeof u === 'string' ? u : u?._id || u?.id;
    if (!userId) {
      res.status(401).end();
      return;
    }
    // This keeps the HTTP response open for SSE
    streamController.addClient(String(userId), res);
  }

  // Optional: quick ping route to verify delivery over SSE
  @httpGet('/test', TYPES.RequireSignIn)
  public test(@response() res: Response) {
    const u = (res.locals as any).user;
    const userId = typeof u === 'string' ? u : u?._id || u?.id;
    if (userId) {
      streamController.publishToUser(String(userId), 'notification', {
        title: 'Ping',
        message: 'SSE is up',
        createdAt: new Date().toISOString(),
      });
    }
    return this.sendResponse(res, 200, 'sent');
  }
}
