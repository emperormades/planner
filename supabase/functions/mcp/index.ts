// Planner MCP — Edge Function entry.
// Roteia OAuth 2.1 (DCR + PKCE) + MCP JSON-RPC sobre HTTP.
import {
  authMetadata,
  authorizeGet,
  baseUrl,
  jwks,
  register,
  resourceMetadata,
  tokenEndpoint,
  validateBearer,
} from "./oauth.ts";
import { handleMcp } from "./mcp.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version, accept",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const p = url.pathname;
  console.log(`[mcp] ${req.method} ${p}`);

  let res: Response;
  try {
    if (
      (p.endsWith("/.well-known/oauth-authorization-server") ||
        p.endsWith("/.well-known/openid-configuration")) &&
      req.method === "GET"
    ) {
      res = authMetadata(req);
    } else if (p.endsWith("/.well-known/oauth-protected-resource") && req.method === "GET") {
      res = resourceMetadata(req);
    } else if (p.endsWith("/jwks") && req.method === "GET") {
      res = jwks();
    } else if (p.endsWith("/register") && req.method === "POST") {
      res = await register(req);
    } else if (p.endsWith("/authorize") && req.method === "GET") {
      res = await authorizeGet(req);
    } else if (p.endsWith("/token") && req.method === "POST") {
      res = await tokenEndpoint(req);
    } else if (req.method === "GET" || req.method === "POST") {
      // qualquer GET/POST = endpoint MCP
      const authHeader = req.headers.get("authorization");
      console.log(`[mcp] auth header: ${authHeader ? "present (" + authHeader.slice(0, 14) + "...)" : "absent"}`);
      const ok = await validateBearer(authHeader);
      if (!ok) {
        const base = baseUrl(req);
        const resourceMetaUrl = `${base}/.well-known/oauth-protected-resource`;
        const wwwAuth = `Bearer error="invalid_token", error_description="Authentication required", resource_metadata="${resourceMetaUrl}"`;
        console.log(`[mcp] returning 401 — WWW-Authenticate: ${wwwAuth}`);
        res = new Response(
          JSON.stringify({
            error: "invalid_token",
            error_description: "Authentication required",
            resource_metadata: resourceMetaUrl,
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "WWW-Authenticate": wwwAuth,
            },
          },
        );
      } else if (req.method === "POST") {
        res = await handleMcp(req);
      } else {
        res = new Response(
          JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Use POST" } }),
          { status: 405, headers: { "Content-Type": "application/json", "Allow": "POST" } },
        );
      }
    } else {
      res = new Response("Not found", { status: 404 });
    }
  } catch (e) {
    console.error(e);
    res = new Response(`Error: ${(e as Error).message}`, { status: 500 });
  }

  // Response.redirect() retorna headers imutáveis — clone numa nova Response.
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});
