/** One DO instance per job — buffers events and fans out SSE to subscribers. */

const MAX_BUFFER = 100;
const HEARTBEAT_MS = 20_000;

export class JobEventHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    /** @type {Set<ReadableStreamDefaultController>} */
    this.subscribers = new Set();
  }

  async fetch(request) {
    if (request.method === "POST") return this.handlePost(request);
    if (request.method === "GET") return this.handleSSE(request);
    return new Response("Not found", { status: 404 });
  }

  async handlePost(request) {
    let event;
    try {
      event = await request.json();
    } catch {
      return Response.json({ error: "invalid json" }, { status: 400 });
    }
    if (!event || typeof event !== "object") {
      return Response.json({ error: "event required" }, { status: 400 });
    }
    await this.appendEvent(event);
    this.broadcast(event);
    return Response.json({ ok: true });
  }

  async appendEvent(event) {
    const buf = (await this.state.storage.get("events")) || [];
    buf.push(event);
    while (buf.length > MAX_BUFFER) buf.shift();
    await this.state.storage.put("events", buf);
  }

  broadcast(event) {
    const line = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
    for (const controller of [...this.subscribers]) {
      try {
        controller.enqueue(line);
      } catch {
        this.subscribers.delete(controller);
      }
    }
  }

  async handleSSE(request) {
    const replay = (await this.state.storage.get("events")) || [];
    let heartbeat;
    let controllerRef;

    const stream = new ReadableStream({
      start: (controller) => {
        controllerRef = controller;
        this.subscribers.add(controller);
        const enc = new TextEncoder();
        for (const ev of replay) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(enc.encode(": ping\n\n"));
          } catch {
            clearInterval(heartbeat);
            this.subscribers.delete(controller);
          }
        }, HEARTBEAT_MS);
      },
      cancel: () => {
        clearInterval(heartbeat);
        if (controllerRef) this.subscribers.delete(controllerRef);
      },
    });

    request.signal?.addEventListener("abort", () => {
      clearInterval(heartbeat);
      if (controllerRef) this.subscribers.delete(controllerRef);
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
}
