// OAuth 2.1 + PKCE + DCR — minimal implementation for single-user MCP server.
import { sha256b64url, sign, verify } from "./jwt.ts";

const SECRET = Deno.env.get("MCP_JWT_SECRET")!;
const ACCESS_TTL = 60 * 60 * 24 * 30;
const REFRESH_TTL = 60 * 60 * 24 * 90;
const CODE_TTL = 600;

export function baseUrl(req: Request): string {
  const override = Deno.env.get("MCP_PUBLIC_URL");
  if (override) return override.replace(/\/$/, "");
  // Edge Functions strip o prefixo /functions/v1/<name> antes do Deno;
  // o host real está no header, e Supabase é HTTPS-only.
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return `https://${host}/functions/v1/mcp`;
}

export function authMetadata(req: Request): Response {
  const b = baseUrl(req);
  return Response.json({
    issuer: b,
    authorization_endpoint: `${b}/authorize`,
    token_endpoint: `${b}/token`,
    registration_endpoint: `${b}/register`,
    jwks_uri: `${b}/jwks`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: ["mcp"],
    // OIDC-required fields (alias openid-configuration)
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
  });
}

export function jwks(): Response {
  // Empty JWKS — não emitimos id_tokens, mas o endpoint precisa existir.
  return Response.json({ keys: [] });
}

export function resourceMetadata(req: Request): Response {
  const b = baseUrl(req);
  return Response.json({
    resource: b,
    authorization_servers: [b],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  });
}

export async function register(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const client_id = crypto.randomUUID();
  return Response.json({
    client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: body.redirect_uris ?? [],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
}

export async function authorizeGet(req: Request): Promise<Response> {
  // Auto-approve: emite code direto.
  // Justificativa: servidor é single-user, URL só conhecida pelo dono;
  // Edge Functions do Supabase bloqueiam HTML interativo (CSP sandbox).
  const u = new URL(req.url);
  const p = u.searchParams;
  const required = ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "response_type"];
  for (const k of required) {
    if (!p.get(k)) return new Response(`Missing ${k}`, { status: 400 });
  }
  if (p.get("response_type") !== "code") return new Response("response_type must be code", { status: 400 });
  if (p.get("code_challenge_method") !== "S256") return new Response("code_challenge_method must be S256", { status: 400 });

  const code = await sign(
    {
      typ: "code",
      cid: p.get("client_id"),
      cc: p.get("code_challenge"),
      ru: p.get("redirect_uri"),
      sc: p.get("scope") ?? "mcp",
    },
    SECRET,
    CODE_TTL,
  );

  const redirectUrl = new URL(p.get("redirect_uri")!);
  redirectUrl.searchParams.set("code", code);
  const state = p.get("state");
  if (state) redirectUrl.searchParams.set("state", state);
  return Response.redirect(redirectUrl, 302);
}

export async function tokenEndpoint(req: Request): Promise<Response> {
  const form = await req.formData();
  const gt = form.get("grant_type");

  if (gt === "authorization_code") {
    const code = form.get("code") as string | null;
    const verifier = form.get("code_verifier") as string | null;
    const redirectUri = form.get("redirect_uri") as string | null;
    if (!code || !verifier || !redirectUri) return errResp("invalid_request", "missing fields");
    const p = await verify(code, SECRET);
    if (!p || p.typ !== "code") return errResp("invalid_grant", "code invalid or expired");
    if (p.ru !== redirectUri) return errResp("invalid_grant", "redirect_uri mismatch");
    if ((await sha256b64url(verifier)) !== p.cc) return errResp("invalid_grant", "PKCE failed");
    return tokensResponse(p.sc as string);
  }

  if (gt === "refresh_token") {
    const rt = form.get("refresh_token") as string | null;
    if (!rt) return errResp("invalid_request", "missing refresh_token");
    const p = await verify(rt, SECRET);
    if (!p || p.typ !== "refresh") return errResp("invalid_grant", "refresh token invalid");
    return tokensResponse(p.sc as string);
  }

  return errResp("unsupported_grant_type", String(gt ?? ""));
}

async function tokensResponse(scope: string): Promise<Response> {
  const access_token = await sign({ typ: "access", sc: scope }, SECRET, ACCESS_TTL);
  const refresh_token = await sign({ typ: "refresh", sc: scope }, SECRET, REFRESH_TTL);
  return Response.json({
    access_token,
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token,
    scope,
  });
}

export async function validateBearer(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const p = await verify(authHeader.slice(7), SECRET);
  return !!p && p.typ === "access";
}

function errResp(error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
