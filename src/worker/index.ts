export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM currencies").first<{ count: number }>();
      return Response.json({ ok: true, service: "management-ledger", currencies: row?.count ?? 0 });
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
};
