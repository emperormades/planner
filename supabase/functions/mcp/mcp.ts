// MCP JSON-RPC handler — ferramentas Supabase (metas, gastos, kaizen, estudos, curso SQL).
import { db } from "./db.ts";

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  // ── Metas ──
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
  // ── Gastos ──
  {
    name: "listar_gastos",
    description: "Lista lançamentos de gastos. Opcional: mês, ano, limite.",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "integer", minimum: 1, maximum: 12 },
        ano: { type: "integer" },
        limite: { type: "integer", minimum: 1, maximum: 500, description: "Máx. de registros (default 100)" },
      },
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
    name: "atualizar_gasto",
    description: "Atualiza um gasto pelo id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        descricao: { type: "string" },
        valor: { type: "number", minimum: 0 },
        categoria: { type: "string" },
        mes: { type: "integer", minimum: 1, maximum: 12 },
        ano: { type: "integer" },
      },
      required: ["id"],
    },
  },
  {
    name: "excluir_gasto",
    description: "Remove um gasto pelo id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
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
  // ── Kaizen ──
  {
    name: "listar_kaizen",
    description:
      "Lista melhorias Kaizen ordenadas por data/hora da melhoria (coluna momento). Cada item inclui momento (quando ocorreu), created_at (registro no app) e texto. Filtro opcional por categoria.",
    inputSchema: {
      type: "object",
      properties: {
        categoria: {
          type: "string",
          enum: ["saude", "profissional", "financeira", "pessoal", "familiar"],
        },
      },
    },
  },
  {
    name: "adicionar_kaizen",
    description: "Registra uma melhoria contínua com área (Saúde, Profissional, etc.). Opcional: momento em ISO 8601 (data/hora da melhoria).",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Descrição da melhoria" },
        categoria: {
          type: "string",
          enum: ["saude", "profissional", "financeira", "pessoal", "familiar"],
          description: "Área da melhoria",
        },
        momento: { type: "string", description: "Data/hora ISO 8601 (ex.: 2026-05-01T14:30:00Z). Default: agora." },
      },
      required: ["texto", "categoria"],
    },
  },
  {
    name: "atualizar_kaizen",
    description: "Atualiza texto, categoria e/ou data/hora (momento ISO) de um Kaizen.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        texto: { type: "string" },
        categoria: {
          type: "string",
          enum: ["saude", "profissional", "financeira", "pessoal", "familiar"],
        },
        momento: { type: "string", description: "Data/hora ISO 8601" },
      },
      required: ["id"],
    },
  },
  {
    name: "excluir_kaizen",
    description: "Remove um item Kaizen pelo id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  // ── Certificações ──
  {
    name: "listar_certificacoes",
    description: "Lista certificações / estudos de certificação.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "criar_certificacao",
    description: "Cria registro de certificação (nome obrigatório).",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        area: { type: "string", description: "Ex.: código Azure ou nome da certificação" },
        prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
        prazo: { type: "string", description: "YYYY-MM-DD ou null" },
        status: { type: "string", enum: ["planejada", "em_andamento", "concluida"] },
        modulos: { type: "integer", minimum: 0 },
        notas: { type: "string" },
      },
      required: ["nome"],
    },
  },
  {
    name: "atualizar_certificacao",
    description: "Atualiza certificação por id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        nome: { type: "string" },
        area: { type: "string" },
        prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
        prazo: { type: "string" },
        status: { type: "string", enum: ["planejada", "em_andamento", "concluida"] },
        modulos: { type: "integer", minimum: 0 },
        notas: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "excluir_certificacao",
    description: "Remove certificação por id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  // ── Livros ──
  {
    name: "listar_livros",
    description: "Lista livros da aba Estudos.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "criar_livro",
    description: "Adiciona livro (título obrigatório).",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        autor: { type: "string" },
        categoria: { type: "string" },
        status: { type: "string", enum: ["quero_ler", "lendo", "lido"] },
        capitulos: { type: "integer", minimum: 0 },
        paginas: { type: "integer", minimum: 0 },
        pagina_atual: { type: "integer", minimum: 0 },
        notas: { type: "string" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "atualizar_livro",
    description: "Atualiza livro por id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        titulo: { type: "string" },
        autor: { type: "string" },
        categoria: { type: "string" },
        status: { type: "string", enum: ["quero_ler", "lendo", "lido"] },
        capitulos: { type: "integer", minimum: 0 },
        paginas: { type: "integer", minimum: 0 },
        pagina_atual: { type: "integer", minimum: 0 },
        notas: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "excluir_livro",
    description: "Remove livro por id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  // ── Curso SQL (aulas) ──
  {
    name: "listar_aulas_sql",
    description: "Lista progresso/notas das aulas do curso SQL (tabela aulas). Filtros opcionais.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["wip", "done"], description: "Filtrar por status" },
        limite: { type: "integer", minimum: 1, maximum: 1000 },
      },
    },
  },
  {
    name: "upsert_aula_sql",
    description: "Cria ou atualiza uma aula pelo código (ex.: F0, F42). Status wip/done e notas opcionais.",
    inputSchema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código da aula, ex. F0" },
        status: { type: "string", enum: ["wip", "done"] },
        notas: { type: "string" },
      },
      required: ["codigo"],
    },
  },
  {
    name: "excluir_aula_sql",
    description: "Remove registro de aula pelo código.",
    inputSchema: {
      type: "object",
      properties: { codigo: { type: "string" } },
      required: ["codigo"],
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
      serverInfo: { name: "planner-mcp", version: "0.3.0" },
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

const KZ_LABEL: Record<string, string> = {
  saude: "Saúde",
  profissional: "Profissional",
  financeira: "Financeira",
  pessoal: "Pessoal",
  familiar: "Familiar",
};

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
      const mid = args.id as number;
      const patch: Record<string, unknown> = {};
      for (const k of ["nome", "descricao", "categoria", "prazo", "progresso", "status"]) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (patch.status === "concluida") patch.progresso = 100;
      if (Object.keys(patch).length === 0) return text("Nada para atualizar.", true);
      const { data, error } = await db.from("metas").update(patch).eq("id", mid).select().single();
      if (error) throw error;
      return text(`Meta #${data.id} atualizada — ${data.nome} (${data.progresso}%, ${data.status})`);
    }

    if (name === "listar_gastos") {
      const lim = Math.min(500, Math.max(1, (args.limite as number) ?? 100));
      let q = db.from("gastos").select("*").order("created_at", { ascending: false }).limit(lim);
      if (args.mes != null) q = q.eq("mes", args.mes as number);
      if (args.ano != null) q = q.eq("ano", args.ano as number);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return text("Nenhum gasto encontrado.");
      return text(rows.map((g) => `#${g.id} $${Number(g.valor).toFixed(2)} ${g.categoria} · ${g.mes}/${g.ano} — ${g.descricao}`).join("\n"));
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

    if (name === "atualizar_gasto") {
      const gid = args.id as number;
      const patch: Record<string, unknown> = {};
      for (const k of ["descricao", "valor", "categoria", "mes", "ano"]) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (Object.keys(patch).length === 0) return text("Nada para atualizar.", true);
      const { data, error } = await db.from("gastos").update(patch).eq("id", gid).select().single();
      if (error) throw error;
      return text(`Gasto #${data.id} atualizado — $${Number(data.valor).toFixed(2)} (${data.mes}/${data.ano})`);
    }

    if (name === "excluir_gasto") {
      const { error } = await db.from("gastos").delete().eq("id", args.id as number);
      if (error) throw error;
      return text(`Gasto #${args.id} removido.`);
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

    if (name === "listar_kaizen") {
      let q = db.from("kaizen").select("*").order("momento", { ascending: false }).order("created_at", { ascending: false });
      if (args.categoria) q = q.eq("categoria", args.categoria as string);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return text("Nenhum item Kaizen.");
      return text(
        rows.map((k) => {
          const lab = KZ_LABEL[k.categoria] ?? k.categoria ?? "?";
          const mq = k.momento != null ? String(k.momento) : "(sem momento — use coluna momento no Supabase)";
          const cr = k.created_at != null ? String(k.created_at) : "";
          return `#${k.id} [${lab}]\n   quando (momento): ${mq}${cr ? `\n   registrado no app: ${cr}` : ""}\n   ${k.texto}`;
        }).join("\n\n"),
      );
    }

    if (name === "adicionar_kaizen") {
      const ins: Record<string, unknown> = {
        texto: args.texto as string,
        categoria: args.categoria as string,
      };
      if (args.momento !== undefined && args.momento !== "") ins.momento = args.momento as string;
      const { data, error } = await db.from("kaizen").insert(ins).select().single();
      if (error) throw error;
      const mq = data.momento != null ? ` quando=${data.momento}` : "";
      return text(`Kaizen #${data.id}${mq} — ${KZ_LABEL[data.categoria] ?? data.categoria}: ${data.texto}`);
    }

    if (name === "atualizar_kaizen") {
      const kid = args.id as number;
      const patch: Record<string, unknown> = {};
      if (args.texto !== undefined) patch.texto = args.texto;
      if (args.categoria !== undefined) patch.categoria = args.categoria;
      if (args.momento !== undefined && args.momento !== "") patch.momento = args.momento;
      if (Object.keys(patch).length === 0) return text("Nada para atualizar.", true);
      const { data, error } = await db.from("kaizen").update(patch).eq("id", kid).select().single();
      if (error) throw error;
      const mq = data.momento != null ? ` momento=${data.momento}` : "";
      return text(`Kaizen #${data.id} atualizado${mq} — ${data.texto}`);
    }

    if (name === "excluir_kaizen") {
      const { error } = await db.from("kaizen").delete().eq("id", args.id as number);
      if (error) throw error;
      return text(`Kaizen #${args.id} removido.`);
    }

    if (name === "listar_certificacoes") {
      const { data, error } = await db.from("certificacoes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return text("Nenhuma certificação.");
      return text(
        rows.map((c) =>
          `#${c.id} ${c.nome} [${c.status}] ${c.area}${c.modulos != null ? ` · ${c.modulos} módulos` : ""}${c.prazo ? ` · prazo ${c.prazo}` : ""}`
        ).join("\n"),
      );
    }

    if (name === "criar_certificacao") {
      const obj: Record<string, unknown> = {
        nome: args.nome,
        area: args.area ?? "Outro",
        prioridade: args.prioridade ?? "media",
        prazo: args.prazo ?? null,
        status: args.status ?? "planejada",
        modulos: args.modulos ?? null,
        notas: args.notas ?? null,
      };
      const { data, error } = await db.from("certificacoes").insert(obj).select().single();
      if (error) throw error;
      return text(`Certificação #${data.id} — ${data.nome}`);
    }

    if (name === "atualizar_certificacao") {
      const cid = args.id as number;
      const patch: Record<string, unknown> = {};
      for (const k of ["nome", "area", "prioridade", "prazo", "status", "modulos", "notas"]) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (Object.keys(patch).length === 0) return text("Nada para atualizar.", true);
      const { data, error } = await db.from("certificacoes").update(patch).eq("id", cid).select().single();
      if (error) throw error;
      return text(`Certificação #${data.id} atualizada — ${data.nome}`);
    }

    if (name === "excluir_certificacao") {
      const { error } = await db.from("certificacoes").delete().eq("id", args.id as number);
      if (error) throw error;
      return text(`Certificação #${args.id} removida.`);
    }

    if (name === "listar_livros") {
      const { data, error } = await db.from("livros").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return text("Nenhum livro.");
      return text(
        rows.map((l) =>
          `#${l.id} ${l.titulo}${l.autor ? ` — ${l.autor}` : ""} [${l.status}] ${l.categoria}`
        ).join("\n"),
      );
    }

    if (name === "criar_livro") {
      const obj: Record<string, unknown> = {
        titulo: args.titulo,
        autor: args.autor ?? null,
        categoria: args.categoria ?? "Outro",
        status: args.status ?? "quero_ler",
        capitulos: args.capitulos ?? null,
        paginas: args.paginas ?? null,
        pagina_atual: args.pagina_atual ?? null,
        notas: args.notas ?? null,
      };
      const { data, error } = await db.from("livros").insert(obj).select().single();
      if (error) throw error;
      return text(`Livro #${data.id} — ${data.titulo}`);
    }

    if (name === "atualizar_livro") {
      const lid = args.id as number;
      const patch: Record<string, unknown> = {};
      for (const k of ["titulo", "autor", "categoria", "status", "capitulos", "paginas", "pagina_atual", "notas"]) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (Object.keys(patch).length === 0) return text("Nada para atualizar.", true);
      const { data, error } = await db.from("livros").update(patch).eq("id", lid).select().single();
      if (error) throw error;
      return text(`Livro #${data.id} atualizado — ${data.titulo}`);
    }

    if (name === "excluir_livro") {
      const { error } = await db.from("livros").delete().eq("id", args.id as number);
      if (error) throw error;
      return text(`Livro #${args.id} removido.`);
    }

    if (name === "listar_aulas_sql") {
      const lim = Math.min(1000, Math.max(1, (args.limite as number) ?? 200));
      let q = db.from("aulas").select("*").order("codigo", { ascending: true }).limit(lim);
      if (args.status) q = q.eq("status", args.status as string);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return text("Nenhuma aula registrada na tabela aulas.");
      return text(
        rows.map((a) => {
          const n = a.notas ? (String(a.notas).length > 100 ? String(a.notas).slice(0, 100) + "…" : a.notas) : "";
          return `${a.codigo} [${a.status ?? "-"}]${n ? ` — ${n}` : ""}`;
        }).join("\n"),
      );
    }

    if (name === "upsert_aula_sql") {
      const codigo = String(args.codigo).trim();
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (args.status !== undefined) patch.status = args.status;
      if (args.notas !== undefined) patch.notas = args.notas;
      const { data: row } = await db.from("aulas").select("id").eq("codigo", codigo).maybeSingle();
      let data;
      let error;
      if (row) {
        ({ data, error } = await db.from("aulas").update(patch).eq("codigo", codigo).select().single());
      } else {
        ({ data, error } = await db.from("aulas").insert({ codigo, ...patch }).select().single());
      }
      if (error) throw error;
      return text(`Aula ${data.codigo} salva — status: ${data.status ?? "null"}`);
    }

    if (name === "excluir_aula_sql") {
      const { error } = await db.from("aulas").delete().eq("codigo", String(args.codigo).trim());
      if (error) throw error;
      return text(`Aula ${args.codigo} removida da tabela.`);
    }

    return text(`Tool desconhecida: ${name}`, true);
  } catch (e) {
    return text(`Erro: ${(e as Error).message}`, true);
  }
}
