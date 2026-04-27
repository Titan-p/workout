export const AUTH_COOKIE_NAME = "workout_auth";
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const TOKEN_VERSION = 1;
const SESSION_DURATION_MS = AUTH_SESSION_MAX_AGE_SECONDS * 1000;

type SessionPayload = {
  v: number;
  exp: number;
};

function encodeBase64Url(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return encodeBase64Url(binary);
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getAuthPassword(): string {
  return process.env.WORKOUT_AUTH_PASSWORD || (isProduction() ? "" : "workout");
}

function getAuthSecret(): string {
  const password = getAuthPassword();
  return process.env.WORKOUT_AUTH_SECRET || password;
}

export function hasAuthPassword(): boolean {
  return Boolean(getAuthPassword());
}

export function isSecureAuthCookie(): boolean {
  return isProduction();
}

export function sanitizeNextPath(value: unknown): string {
  const path = typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
  return path.startsWith("/api/") ? "/" : path;
}

export function isValidPassword(value: unknown): boolean {
  const password = getAuthPassword();
  return typeof value === "string" && Boolean(password) && safeEqual(value, password);
}

async function signPayload(payload: string): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) {
    return "";
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createAuthSession(): Promise<string> {
  const payload: SessionPayload = {
    v: TOKEN_VERSION,
    exp: Date.now() + SESSION_DURATION_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAuthSession(token: string | undefined): Promise<boolean> {
  if (!token || !hasAuthPassword()) {
    return false;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = await signPayload(encodedPayload);
  if (!expectedSignature || !safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<SessionPayload>;
    return payload.v === TOKEN_VERSION && typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}
