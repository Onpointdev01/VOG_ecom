import { controller, httpGet, request, response, queryParam } from 'inversify-express-utils';
import type { Request, Response } from 'express';
import { streamController } from '../realtime/StreamController';
import { env } from '../config';
// re-use your JWT helper if you have one:
import { verifyToken } from '../utils/helpers/token'; // adjust path/name if different

@controller('/api/v1/stream')
export class StreamHttpController {
  @httpGet('/events')
  public events(
    @request() _req: Request,
    @response() res: Response,
    @queryParam('token') token?: string,
  ) {
    try {
      if (!token) {
        res.status(401).json({ status: 'error', message: 'Missing token' });
        return;
      }

      // verify token (adapt to your helper’s return shape)
      const decoded: any = verifyToken(token, env.JWT_SECRET);
      const userId = String(decoded?.id || decoded?._id || decoded?.userId || '');
      if (!userId) {
        res.status(401).json({ status: 'error', message: 'Invalid token' });
        return;
      }

      // keep the connection open
      streamController.addClient(userId, res);
      // do not end the response
    } catch {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
  }
}
