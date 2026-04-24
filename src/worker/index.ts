import { route } from "./router";
import type { Env } from "./env";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM currencies").first<{ count: number }>();
      return Response.json({ ok: true, service: "management-ledger", currencies: row?.count ?? 0 });
    }

    if (url.pathname.startsWith("/api/")) {
      return route(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
