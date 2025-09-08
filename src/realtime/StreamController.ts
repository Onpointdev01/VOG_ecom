import type { Response } from 'express';

type Client = {
  userId: string;
  res: Response;
  keepAlive?: NodeJS.Timeout;
};

class StreamController {
  private clients = new Map<string, Set<Client>>();

  addClient(userId: string, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    res.flushHeaders?.();

    try { res.write(':ok\n\n'); } catch {}

    const bucket = this.clients.get(userId) ?? new Set<Client>();
    const client: Client = { userId, res };
    bucket.add(client);
    this.clients.set(userId, bucket);

    const ka = setInterval(() => {
      try { res.write(`:ka ${Date.now()}\n\n`); } catch {}
    }, 15000);
    client.keepAlive = ka;

    const cleanup = () => {
      clearInterval(ka);
      const set = this.clients.get(userId);
      set?.delete(client);
      if (set && set.size === 0) this.clients.delete(userId);
      try { res.end(); } catch {}
    };

    res.on('close', cleanup);
    res.on('error', cleanup);

    return cleanup;
  }

  private send(res: Response, event: string, data: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    res.write(`event: ${event}\n`);
    res.write(`data: ${payload}\n\n`);
  }

  publishToUser(userId: string, event: string, data: unknown): number {
    const set = this.clients.get(String(userId));
    if (!set || set.size === 0) return 0;
    for (const c of set) {
      try { this.send(c.res, event, data); } catch {}
    }
    return set.size;
  }

  publishToMany(userIds: Array<string | undefined | null>, event: string, data: unknown): number {
    const uniq = new Set(userIds.filter(Boolean).map(String));
    let count = 0;
    uniq.forEach(uid => { count += this.publishToUser(uid, event, data); });
    return count;
  }

  broadcast(event: string, data: unknown): number {
    let count = 0;
    for (const [, set] of this.clients) {
      for (const c of set) {
        try { this.send(c.res, event, data); count++; } catch {}
      }
    }
    return count;
  }
}

export const streamController = new StreamController();
export type { StreamController };
