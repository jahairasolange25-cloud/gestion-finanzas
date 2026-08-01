import { createHash, randomBytes, scrypt as scryptCb } from "node:crypto";
import type { ScryptOptions } from "node:crypto";
import { timingSafeEqual } from "node:crypto";

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export const SESSION_COOKIE = "mf_session";
/** 30 días de vida de sesión (ventana deslizante). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Si queda menos de la mitad de vida, la sesión se renueva al acceder. */
export const SESSION_REFRESH_MS = SESSION_TTL_MS / 2;
/** Máximo de sesiones simultáneas por usuario; al exceder, se elimina la más antigua. */
export const MAX_SESSIONS_PER_USER = 5;

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

/** Hash de contraseña: scrypt con salt por usuario. Formato: scrypt:N:r:p:salt:hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, KEYLEN, SCRYPT_PARAMS);
  return `scrypt:${SCRYPT_PARAMS.N}:${SCRYPT_PARAMS.r}:${SCRYPT_PARAMS.p}:${salt}:${key.toString("hex")}`;
}

/** Comparación en tiempo constante contra un hash almacenado. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hex] = parts;
  const expected = Buffer.from(hex, "hex");
  const key = await scryptAsync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Token de sesión (64 hex) + su hash para almacenar en BD. */
export function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: sha256(token) };
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Cabecera Set-Cookie de la sesión. HttpOnly + SameSite=Lax (anti-CSRF de
 * base) + Secure en producción. En localhost http no se pueden usar Secure.
 */
export function sessionCookie(token: string, opts?: { clear?: boolean }): string {
  const maxAge = opts?.clear ? 0 : Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE}=${opts?.clear ? "" : token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
