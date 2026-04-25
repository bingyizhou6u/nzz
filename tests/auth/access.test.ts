import { describe, expect, it } from "vitest";
import { authenticateAccessIdentity } from "../../src/auth/access";
import type { Env } from "../../src/worker/env";

const baseEnv = {
  AUTH_MODE: "development",
  DEV_ACTOR_EMAIL: "finance@example.test",
  CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud_1"
} as Env;

describe("authenticateAccessIdentity", () => {
  it("uses explicit development actor email in development mode", async () => {
    await expect(authenticateAccessIdentity(new Request("https://ledger.test"), baseEnv)).resolves.toEqual({
      email: "finance@example.test",
      accessSubject: null,
      accessIssuer: "development",
      accessAudience: ["development"]
    });
  });

  it("rejects production requests without Access JWT", async () => {
    await expect(
      authenticateAccessIdentity(new Request("https://ledger.test"), { ...baseEnv, AUTH_MODE: "access" })
    ).rejects.toMatchObject({ status: 401, message: "Missing Cloudflare Access JWT" });
  });

  it("defaults missing auth mode to Access authentication", async () => {
    const { AUTH_MODE: _authMode, ...envWithoutMode } = baseEnv;
    await expect(authenticateAccessIdentity(new Request("https://ledger.test"), envWithoutMode as Env)).rejects.toMatchObject({
      status: 401,
      message: "Missing Cloudflare Access JWT"
    });
  });

  it("rejects development mode without explicit dev actor", async () => {
    await expect(
      authenticateAccessIdentity(new Request("https://ledger.test"), { ...baseEnv, DEV_ACTOR_EMAIL: "" })
    ).rejects.toMatchObject({ status: 401, message: "Development actor email is not configured" });
  });
});
