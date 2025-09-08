// src/controllers/StreamController.ts
import { inject } from 'inversify';
import { controller, httpGet, request, response } from 'inversify-express-utils';
import type { Request, Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { streamController } from '../realtime/streamController';
import type { IUser } from '../models';

@controller('/api/v1/stream')
export class StreamController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Server-Sent Events endpoint.
   * Requires auth so we can attach the stream to the current user.
   */
  @httpGet('/', TYPES.RequireSignIn)
  public open(@request() req: Request, @response() res: Response) {
    // Support either middleware styles used elsewhere in the codebase
    const u = (req as any).user || (res.locals as any).user;
    const userId: string | undefined =
      typeof u === 'string' ? u : (u?._id || u?.id) ? String(u._id || u.id) : undefined;

    if (!userId) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    // Hand off to the SSE hub (sets headers & heartbeats)
    const cleanup = streamController.addClient(userId, res);

    // Also clean up if the HTTP layer clears, just in case
    req.on('close', cleanup);
  }

  /**
   * Tiny health endpoint to verify the route is mounted.
   * (No auth, no SSE, just useful for smoke tests.)
   */
  @httpGet('/ping')
  public ping(@response() res: Response) {
    return this.sendResponse(res, 200, 'ok', { now: new Date().toISOString() });
  }
}
