export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export interface RequestContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
}

export type Handler = (context: RequestContext) => Promise<Response>;
