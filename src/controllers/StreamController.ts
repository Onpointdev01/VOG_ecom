// src/controllers/StreamController.ts
import { controller, httpGet, request, response } from "inversify-express-utils";
import { Request, Response } from "express";
import { addClient } from "../realtime/sse";
import { decodeToken } from "../utils/helpers";

@controller("/api/v1/stream")
export class StreamController {
  @httpGet("/events")
  public async events(@request() req: Request, @response() res: Response) {
    const token =
      (req.query.token as string) ||
      (typeof req.headers.authorization === "string"
        ? req.headers.authorization.replace(/^Bearer\s+/i, "")
        : undefined);

    let userId = "";
    if (token) {
      try {
        const decoded: any = decodeToken(token);
        userId = decoded?.id || "";
      } catch (e) { /* ignore; unauthorized below */ }
    }
    if (!userId) {
      res.status(401).json({ status: "error", message: "Unauthorized" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // initial hello (optional)
    res.write(`event: hello\n`);
    res.write(`data: ${JSON.stringify({ ok: true, t: Date.now() })}\n\n`);

    addClient(userId, res);

    // heartbeat to keep proxies happy
    const hb = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 15000);
    req.on("close", () => clearInterval(hb));
  }
}
