// MCP JSON-RPC handler with 5 tools wrapping Supabase CRUD.
import { db } from "./db.ts";

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "listar_metas",
    description: "Lista metas do planner. Filtra por status opcionalmente.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ativa", "concluida", "pausada"], description: "Filtrar por status" },
      },
    },
  },
  {
    name: "criar_meta",
    description: "Cria uma nova meta. Apenas 'nome' é obrigatório.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome curto da meta" },
        descricao: { type: "string" },
        categoria: {
          type: "string",
          enum: ["Financeiro", "Visto/Imigração", "Estudos", "Carreira", "Saúde", "Pessoal", "Outro"],
        },
        prazo: { type: "string", description: "Data ISO YYYY-MM-DD" },
        progresso: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["nome"],
    },
  },
  {
    name: "atualizar_meta",
    description: "Atualiza uma meta existente. Setar status='concluida' força progresso=100.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "ID da meta" },
        nome: { type: "string" },
        descricao: { type: "string" },
        categoria: { type: "string" },
        prazo: { type: "string" },
        progresso: { type: "integer", minimum: 0, maximum: 100 },
        status: { type: "string", enum: ["ativa", "concluida", "pausada"] },
      },
      required: ["id"],
    },
  },
  {
    name: "lancar_gasto",
    description: "Registra um gasto mensal. Default: mês e ano atuais.",
    inputSchema: {
      type: "object",
      properties: {
        descricao: { type: "string" },
        valor: { type: "number", minimum: 0 },
        categoria: {
          type: "string",
          enum: ["Moradia", "Alimentação", "Transporte", "Utilidades", "Saúde", "Educação", "Lazer", "Universidade", "Outro"],
        },
        mes: { type: "integer", minimum: 1, maximum: 12 },
        ano: { type: "integer" },
      },
      required: ["descricao", "valor", "categoria"],
    },
  },
  {
    name: "resumo_mes",
    description: "Total de gastos do mês com breakdown por categoria. Default: mês corrente.",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "integer", minimum: 1, maximum: 12 },
        ano: { type: "integer" },
      },
    },
  },
];

export async function handleMcp(req: Request): Promise<Response> {
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  const { id = null, method, params = {} } = body;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "planner-mcp", version: "0.1.0" },
    });
  }
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params.name as string;
    const args = (params.arguments as Record<string, unknown>) ?? {};
    return ok(id, await callTool(name, args));
  }
  if (method === "notifications/initialized") return new Response(null, { status: 202 });
  if (method === "ping") return ok(id, {});
  return err(id, -32601, `Method not found: ${method}`);
}

function ok(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}
function err(id: unknown, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}
function text(t: string, isError = false) {
  return { content: [{ type: "text", text: t }], isError };
}

async function callTool(name: string, args: Record<string, unknown>) {
  try {
    if (name === "listar_metas") {
      let q = db.from("metas").select("*").order("created_at", { ascending: false });
      if (args.status) q = q.eq("status", args.status as string);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return text("Nenhuma meta encontrada.");
      return text(rows.map((m) => `#${m.id} ${m.nome} — ${m.progresso}% [${m.status}] (${m.categoria}${m.prazo ? `, prazo ${m.prazo}` : ""})${m.descricao ? `\n   ${m.descricao}` : ""}`).join("\n"));
    }

    if (name === "criar_meta") {
      const obj = {
        nome: args.nome,
        descricao: args.descricao ?? null,
        categoria: args.categoria ?? "Outro",
        prazo: args.prazo ?? null,
        progresso: args.progresso ?? 0,
        status: "ativa",
      };
      const { data, error } = await db.from("metas").insert(obj).select().single();
      if (error) throw error;
      return text(`Meta criada: #${data.id} — ${data.nome} (${data.categoria}, ${data.progresso}%)`);
    }

    if (name === "atualizar_meta") {
      const id = args.id as number;
      const patch: Record<string, unknown> = {};
      for (const k of ["nome", "descricao", "categoria", "prazo", "progresso", "status"]) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (patch.status === "concluida") patch.progresso = 100;
      if (Object.keys(patch).length === 0) return text("Nada para atualizar.", true);
      const { data, error } = await db.from("metas").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return text(`Meta #${data.id} atualizada — ${data.nome} (${data.progresso}%, ${data.status})`);
    }

    if (name === "lancar_gasto") {
      const now = new Date();
      const obj = {
        descricao: args.descricao,
        valor: args.valor,
        categoria: args.categoria,
        mes: args.mes ?? now.getUTCMonth() + 1,
        ano: args.ano ?? now.getUTCFullYear(),
      };
      const { data, error } = await db.from("gastos").insert(obj).select().single();
      if (error) throw error;
      return text(`Gasto lançado: $${Number(data.valor).toFixed(2)} em ${data.categoria} (${data.mes}/${data.ano}) — ${data.descricao}`);
    }

    if (name === "resumo_mes") {
      const now = new Date();
      const mes = (args.mes as number) ?? now.getUTCMonth() + 1;
      const ano = (args.ano as number) ?? now.getUTCFullYear();
      const { data, error } = await db.from("gastos").select("valor,categoria,descricao").eq("mes", mes).eq("ano", ano);
      if (error) throw error;
      const rows = data ?? [];
      const total = rows.reduce((a, r) => a + Number(r.valor), 0);
      const cats: Record<string, number> = {};
      for (const r of rows) cats[r.categoria] = (cats[r.categoria] ?? 0) + Number(r.valor);
      const breakdown = Object.entries(cats).sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `  ${c}: $${v.toFixed(2)}`).join("\n");
      const out = `Resumo ${mes}/${ano}\nTotal: $${total.toFixed(2)} em ${rows.length} lançamentos${breakdown ? `\n\nPor categoria:\n${breakdown}` : ""}`;
      return text(out);
    }

    return text(`Tool desconhecida: ${name}`, true);
  } catch (e) {
    return text(`Erro: ${(e as Error).message}`, true);
  }
}
