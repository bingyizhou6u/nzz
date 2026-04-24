export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "management-ledger" });
    }
    return new Response("Not found", { status: 404 });
  }
};
