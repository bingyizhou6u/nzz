import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateAccessIdentity } from "../../src/auth/access";
import type { Env } from "../../src/worker/env";

const baseEnv = {
  AUTH_MODE: "development",
  ALLOW_INSECURE_DEV_AUTH: "true",
  DEV_ACTOR_EMAIL: "finance@example.test",
  CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud_1"
} as Env;

describe("authenticateAccessIdentity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses explicit development actor email in development mode", async () => {
    await expect(authenticateAccessIdentity(new Request("https://ledger.test"), baseEnv)).resolves.toEqual({
      email: "finance@example.test",
      accessSubject: null,
      accessIssuer: "development",
      accessAudience: ["development"]
    });
  });

  it("rejects development mode without the explicit insecure development auth switch", async () => {
    const { ALLOW_INSECURE_DEV_AUTH: _allow, ...envWithoutSwitch } = baseEnv;

    await expect(authenticateAccessIdentity(new Request("https://ledger.test"), envWithoutSwitch as Env)).rejects.toMatchObject({
      status: 401,
      message: "Development auth requires ALLOW_INSECURE_DEV_AUTH=true"
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

  it("rejects unsupported auth modes", async () => {
    await expect(
      authenticateAccessIdentity(new Request("https://ledger.test"), { ...baseEnv, AUTH_MODE: "local" } as unknown as Env)
    ).rejects.toMatchObject({ status: 401, message: "Authentication mode is not configured" });
  });

  it.each(["team.cloudflareaccess.com", "http://team.cloudflareaccess.com", "not a url"])(
    "rejects invalid Access team domain %s with a controlled auth error",
    async (teamDomain) => {
      await expect(
        authenticateAccessIdentity(
          new Request("https://ledger.test", { headers: { "Cf-Access-Jwt-Assertion": "token" } }),
          { ...baseEnv, AUTH_MODE: "access", CF_ACCESS_TEAM_DOMAIN: teamDomain }
        )
      ).rejects.toMatchObject({ status: 401, message: "Cloudflare Access is not configured" });
    }
  );

  it("verifies Cloudflare Access JWT and returns normalized identity claims", async () => {
    const { token, fetchMock } = await accessJwtFixture({
      issuer: "https://team.cloudflareaccess.com",
      audience: "aud_1",
      email: " Finance@Example.Test ",
      subject: "access-subject-1"
    });

    await expect(
      authenticateAccessIdentity(
        new Request("https://ledger.test", { headers: { "Cf-Access-Jwt-Assertion": token } }),
        { ...baseEnv, AUTH_MODE: "access" }
      )
    ).resolves.toEqual({
      email: "finance@example.test",
      accessSubject: "access-subject-1",
      accessIssuer: "https://team.cloudflareaccess.com",
      accessAudience: ["aud_1"]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("rejects Access JWT with invalid audience", async () => {
    const { token } = await accessJwtFixture({
      issuer: "https://team.cloudflareaccess.com",
      audience: "wrong_aud",
      email: "finance@example.test",
      subject: "access-subject-1"
    });

    await expect(
      authenticateAccessIdentity(
        new Request("https://ledger.test", { headers: { "Cf-Access-Jwt-Assertion": token } }),
        { ...baseEnv, AUTH_MODE: "access" }
      )
    ).rejects.toMatchObject({ status: 401, message: "Invalid Cloudflare Access JWT" });
  });
});

async function accessJwtFixture(options: { issuer: string; audience: string; email: string; subject: string }) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keyId = "test-key-1";
  const token = await new SignJWT({ email: options.email })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setSubject(options.subject)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  const fetchMock = vi.fn(async () =>
    Response.json({
      keys: [{ ...jwk, kid: keyId, alg: "RS256", use: "sig" }]
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return { token, fetchMock };
}
