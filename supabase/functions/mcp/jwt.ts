// HS256 JWT helpers via Web Crypto + SHA-256 PKCE check.
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function sign(
  payload: Record<string, unknown>,
  secret: string,
  ttlSec: number,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const h = b64url(enc.encode(JSON.stringify(header)));
  const b = b64url(enc.encode(JSON.stringify(body)));
  const data = `${h}.${b}`;
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

export async function verify(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    b64urlDecode(s),
    enc.encode(`${h}.${b}`),
  );
  if (!ok) return null;
  try {
    const p = JSON.parse(dec.decode(b64urlDecode(b))) as Record<string, unknown>;
    if (typeof p.exp === "number" && p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

export async function sha256b64url(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return b64url(hash);
}
