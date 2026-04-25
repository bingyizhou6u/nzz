import type { Env } from "../worker/env";
import { authenticateAccessIdentity } from "./access";
import { ActorRepository } from "./actorRepository";
import type { AuthenticatedActor } from "./types";

export async function authenticateRequest(request: Request, env: Env): Promise<AuthenticatedActor> {
  const identity = await authenticateAccessIdentity(request, env);
  return new ActorRepository(env.DB).requireActorByEmail(identity.email);
}
