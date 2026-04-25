import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../worker/env";
import { AuthError, type AuthenticatedIdentity } from "./types";

interface AccessJwtPayload {
  email?: unknown;
  sub?: unknown;
  iss?: unknown;
  aud?: unknown;
}

export async function authenticateAccessIdentity(request: Request, env: Env): Promise<AuthenticatedIdentity> {
  const mode = env.AUTH_MODE ?? "access";
  if (mode === "development") {
    const email = env.DEV_ACTOR_EMAIL?.trim().toLowerCase();
    if (!email) throw new AuthError(401, "Development actor email is not configured");
    return {
      email,
      accessSubject: null,
      accessIssuer: "development",
      accessAudience: ["development"]
    };
  }
  if (mode !== "access") {
    throw new AuthError(401, "Authentication mode is not configured");
  }

  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !audience) throw new AuthError(401, "Cloudflare Access is not configured");

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new AuthError(401, "Missing Cloudflare Access JWT");

  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  const verified = await jwtVerify(token, jwks, {
    issuer: teamDomain,
    audience
  }).catch(() => {
    throw new AuthError(401, "Invalid Cloudflare Access JWT");
  });

  return identityFromPayload(verified.payload as AccessJwtPayload);
}

function normalizeTeamDomain(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function identityFromPayload(payload: AccessJwtPayload): AuthenticatedIdentity {
  if (typeof payload.email !== "string" || !payload.email.trim()) {
    throw new AuthError(401, "Cloudflare Access JWT is missing email");
  }
  const audience = Array.isArray(payload.aud)
    ? payload.aud.filter((value): value is string => typeof value === "string")
    : typeof payload.aud === "string"
      ? [payload.aud]
      : [];
  return {
    email: payload.email.trim().toLowerCase(),
    accessSubject: typeof payload.sub === "string" ? payload.sub : null,
    accessIssuer: typeof payload.iss === "string" ? payload.iss : "",
    accessAudience: audience
  };
}
