import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";

function loadEnv() {
  const envPath = join(process.cwd(), "..", "..", ".env");
  const content = readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const [key, ...valueParts] = line.split("=");
    if (key && process.env[key] === undefined) {
      process.env[key] = valueParts.join("=").replace(/\$\$/g, "$");
    }
  }
}

loadEnv();

const { buildApp } = await import("../app.js");
const { prisma } = await import("../plugins/prisma.js");
const { hashToken, createRandomToken } = await import("../lib/crypto.js");
const { isAllowedInstitutionalEmail } = await import("@ca/shared");

async function createSession(role: "USER" | "ADMIN") {
  const token = createRandomToken(48);
  const suffix = createRandomToken(8).toLowerCase();
  const user = await prisma.user.create({
    data: {
      googleSubject: `test-${role.toLowerCase()}-${suffix}`,
      name: `Test ${role}`,
      email: `test-${role.toLowerCase()}-${suffix}@sou.unijui.edu.br`,
      role
    }
  });

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });

  return { user, token };
}

function authCallbackUrl(email: string) {
  return {
    method: "GET" as const,
    url: "/auth/google/callback?code=fake-code&state=test-state-12345678901234567890",
    headers: {
      cookie: "ca_oauth_state=test-state-12345678901234567890; ca_oauth_nonce=test-nonce"
    },
    authProvider: {
      async exchangeCodeForIdentity() {
        return {
          googleSubject: `google-${email}`,
          email,
          name: "Google User"
        };
      }
    }
  };
}

describe("institutional email validation", () => {
  it("allows institutional student and professor domains", () => {
    expect(isAllowedInstitutionalEmail("aluno@sou.unijui.edu.br")).toBe(true);
    expect(isAllowedInstitutionalEmail("professor@unijui.edu.br")).toBe(true);
  });

  it("rejects non-institutional domains", () => {
    expect(isAllowedInstitutionalEmail("usuario@gmail.com")).toBe(false);
  });
});

describe("auth and authorization routes", () => {
  beforeAll(async () => {
    await prisma.course.upsert({
      where: { slug: "engenharia-de-software" },
      update: { canPurchase: true, deletedAt: null },
      create: { name: "Engenharia de Software", slug: "engenharia-de-software", canPurchase: true }
    });
  });

  it("redirects to Google without a hosted-domain account filter", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/auth/google" });
    await app.close();

    const location = response.headers.location;
    expect(response.statusCode).toBe(302);
    expect(location).toBeDefined();

    const googleUrl = new URL(location as string);
    expect(googleUrl.origin).toBe("https://accounts.google.com");
    expect(googleUrl.pathname).toBe("/o/oauth2/v2/auth");
    expect(googleUrl.searchParams.get("prompt")).toBe("select_account");
    expect(googleUrl.searchParams.has("hd")).toBe(false);
    expect(googleUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(googleUrl.searchParams.get("state")).toBeTruthy();
    expect(googleUrl.searchParams.get("nonce")).toBeTruthy();
  });

  it("accepts a Google callback with an institutional email", async () => {
    const request = authCallbackUrl(`allowed-${createRandomToken(6)}@sou.unijui.edu.br`);
    const app = buildApp({ authProvider: request.authProvider });

    const response = await app.inject({ method: request.method, url: request.url, headers: request.headers });
    await app.close();

    expect(response.statusCode).toBe(302);
    expect(JSON.stringify(response.headers["set-cookie"])).toContain("ca_session=");
  });

  it("rejects a Google callback with a non-institutional email", async () => {
    const request = authCallbackUrl(`blocked-${createRandomToken(6)}@gmail.com`);
    const app = buildApp({ authProvider: request.authProvider });

    const response = await app.inject({ method: request.method, url: request.url, headers: request.headers });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("INSTITUTIONAL_EMAIL_REQUIRED");
  });

  it("rejects authenticated routes without a session", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/courses" });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it("rejects USER access to admin routes", async () => {
    const { token } = await createSession("USER");
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/admin/auth-check", headers: { cookie: `ca_session=${token}` } });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it("allows ADMIN access to admin routes", async () => {
    const { token } = await createSession("ADMIN");
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/admin/auth-check", headers: { cookie: `ca_session=${token}` } });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
  });
});


