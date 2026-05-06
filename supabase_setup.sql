-- ════════════════════════════════════════════════════════════════
-- Planner EUA 2026 — Setup completo (schema + RLS)
-- Idempotente: pode rodar em projeto novo ou re-rodar com segurança.
-- Modelo: single-user. Acesso liberado para qualquer sessão autenticada.
-- ════════════════════════════════════════════════════════════════

-- ──────────────── METAS ────────────────
CREATE TABLE IF NOT EXISTS public.metas (
  id          bigserial PRIMARY KEY,
  nome        text        NOT NULL,
  descricao   text,
  categoria   text        NOT NULL DEFAULT 'Outro',
  prazo       date,
  progresso   int         NOT NULL DEFAULT 0 CHECK (progresso BETWEEN 0 AND 100),
  status      text        NOT NULL DEFAULT 'ativa'
                          CHECK (status IN ('ativa','concluida','pausada')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metas_status     ON public.metas (status);
CREATE INDEX IF NOT EXISTS idx_metas_created_at ON public.metas (created_at DESC);

-- ──────────────── GASTOS ────────────────
CREATE TABLE IF NOT EXISTS public.gastos (
  id          bigserial PRIMARY KEY,
  descricao   text         NOT NULL,
  valor       numeric(12,2) NOT NULL CHECK (valor >= 0),
  categoria   text         NOT NULL DEFAULT 'Outro',
  mes         int          NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano         int          NOT NULL CHECK (ano BETWEEN 2024 AND 2040),
  fixo        boolean      NOT NULL DEFAULT false,
  created_at  timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS fixo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_gastos_periodo    ON public.gastos (ano DESC, mes DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria  ON public.gastos (categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_fixo       ON public.gastos (fixo);
CREATE INDEX IF NOT EXISTS idx_gastos_created_at ON public.gastos (created_at DESC);

-- ──────────────── CERTIFICAÇÕES ────────────────
CREATE TABLE IF NOT EXISTS public.certificacoes (
  id          bigserial PRIMARY KEY,
  nome        text        NOT NULL,
  area        text        NOT NULL DEFAULT 'Outro',
  prioridade  text        NOT NULL DEFAULT 'media'
                          CHECK (prioridade IN ('alta','media','baixa')),
  prazo       date,
  status      text        NOT NULL DEFAULT 'planejada'
                          CHECK (status IN ('planejada','em_andamento','concluida')),
  modulos     int         CHECK (modulos >= 0),
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.certificacoes ADD COLUMN IF NOT EXISTS modulos int CHECK (modulos >= 0);
CREATE INDEX IF NOT EXISTS idx_certs_status     ON public.certificacoes (status);
CREATE INDEX IF NOT EXISTS idx_certs_created_at ON public.certificacoes (created_at DESC);

-- ──────────────── LIVROS ────────────────
CREATE TABLE IF NOT EXISTS public.livros (
  id          bigserial PRIMARY KEY,
  titulo      text        NOT NULL,
  autor       text,
  categoria   text        NOT NULL DEFAULT 'Outro',
  status      text        NOT NULL DEFAULT 'quero_ler'
                          CHECK (status IN ('quero_ler','lendo','lido')),
  capitulos   int         CHECK (capitulos >= 0),
  paginas     int         CHECK (paginas >= 0),
  pagina_atual int        CHECK (pagina_atual >= 0),
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.livros ADD COLUMN IF NOT EXISTS capitulos int CHECK (capitulos >= 0);
ALTER TABLE public.livros ADD COLUMN IF NOT EXISTS paginas int CHECK (paginas >= 0);
ALTER TABLE public.livros ADD COLUMN IF NOT EXISTS pagina_atual int CHECK (pagina_atual >= 0);
CREATE INDEX IF NOT EXISTS idx_livros_status     ON public.livros (status);
CREATE INDEX IF NOT EXISTS idx_livros_created_at ON public.livros (created_at DESC);

-- ──────────────── KAIZEN (melhoria contínua — dashboard) ────────────────
CREATE TABLE IF NOT EXISTS public.kaizen (
  id          bigserial PRIMARY KEY,
  texto       text        NOT NULL,
  categoria   text        NOT NULL DEFAULT 'pessoal',
  momento     timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kaizen ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'pessoal';
ALTER TABLE public.kaizen ADD COLUMN IF NOT EXISTS momento timestamptz;
UPDATE public.kaizen SET momento = created_at WHERE momento IS NULL;
ALTER TABLE public.kaizen ALTER COLUMN momento SET DEFAULT now();
ALTER TABLE public.kaizen ALTER COLUMN momento SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kaizen_created_at ON public.kaizen (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kaizen_momento ON public.kaizen (momento DESC);

-- ──────────────── AULAS (Curso SQL) ────────────────
-- Progresso e notas das aulas do SQL Impressionador.
-- Catálogo (módulos + nomes das aulas) fica no JS — não armazenado.
-- Cada linha = uma aula que teve status definido ou nota anexada.
CREATE TABLE IF NOT EXISTS public.aulas (
  id          bigserial PRIMARY KEY,
  codigo      text        UNIQUE NOT NULL,        -- F0, F1, F2, ...
  status      text        CHECK (status IN ('wip','done')),
  notas       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aulas_status ON public.aulas (status);

-- ════════════════════════════════════════════════════════════════
-- RLS — habilita e restringe a usuários autenticados
-- (single-user: qualquer sessão autenticada lê/escreve tudo)
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.metas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livros        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aulas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kaizen        ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas (caso já existam de tentativas anteriores)
DROP POLICY IF EXISTS "allow all"       ON public.metas;
DROP POLICY IF EXISTS "auth_all_metas"  ON public.metas;
DROP POLICY IF EXISTS "allow all"       ON public.gastos;
DROP POLICY IF EXISTS "auth_all_gastos" ON public.gastos;
DROP POLICY IF EXISTS "allow all"       ON public.certificacoes;
DROP POLICY IF EXISTS "auth_all_certs"  ON public.certificacoes;
DROP POLICY IF EXISTS "allow all"       ON public.livros;
DROP POLICY IF EXISTS "auth_all_livros" ON public.livros;
DROP POLICY IF EXISTS "auth_all_aulas"  ON public.aulas;
DROP POLICY IF EXISTS "auth_all_kaizen" ON public.kaizen;

-- Cria policies novas — só authenticated
CREATE POLICY "auth_all_metas"  ON public.metas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_gastos" ON public.gastos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_certs"  ON public.certificacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_livros" ON public.livros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_aulas"  ON public.aulas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_kaizen" ON public.kaizen
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
