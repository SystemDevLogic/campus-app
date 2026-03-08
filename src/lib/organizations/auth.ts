import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "org_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
const KEY_LENGTH = 32;

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret() {
  return process.env.ORGANIZATION_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function getOrganizationSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getOrganizationSessionDurationSeconds() {
  return SESSION_DURATION_SECONDS;
}

export function hashOrganizationPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyOrganizationPassword(password: string, storedHash: string | null) {
  if (!storedHash) return false;

  const [algorithm, salt, hash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, KEY_LENGTH);
  const stored = Buffer.from(hash, "base64url");

  if (derived.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(derived, stored);
}

export function buildOrganizationSessionToken(accountId: string) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("Missing ORGANIZATION_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  }

  const payload = {
    accountId,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function readOrganizationSessionToken(token: string | undefined | null) {
  if (!token) return null;

  const secret = getSessionSecret();
  if (!secret) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const givenSignature = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (givenSignature.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(givenSignature, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as { accountId?: string; exp?: number };
    if (!parsed.accountId || typeof parsed.exp !== "number") {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (parsed.exp <= nowSeconds) {
      return null;
    }

    return { accountId: parsed.accountId, exp: parsed.exp };
  } catch {
    return null;
  }
}
