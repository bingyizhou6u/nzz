import type { AuthenticatedActor } from "../auth/types";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_MODE?: "development" | "access";
  DEV_ACTOR_EMAIL?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export interface RequestContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
  actor: AuthenticatedActor | null;
}

export type Handler = (context: RequestContext) => Promise<Response>;
