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
  pagamento   text         NOT NULL DEFAULT 'pago'
                            CHECK (pagamento IN ('pago','nao_pago','parcial')),
  valor_pago  numeric(12,2) CHECK (valor_pago >= 0),
  created_at  timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS fixo boolean NOT NULL DEFAULT false;
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS pagamento text NOT NULL DEFAULT 'pago';
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS valor_pago numeric(12,2) CHECK (valor_pago >= 0);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gastos_pagamento_check') THEN
    ALTER TABLE public.gastos ADD CONSTRAINT gastos_pagamento_check
      CHECK (pagamento IN ('pago','nao_pago','parcial'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_gastos_periodo    ON public.gastos (ano DESC, mes DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria  ON public.gastos (categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_fixo       ON public.gastos (fixo);
CREATE INDEX IF NOT EXISTS idx_gastos_pagamento  ON public.gastos (pagamento);
CREATE INDEX IF NOT EXISTS idx_gastos_created_at ON public.gastos (created_at DESC);

-- ──────────────── GANHOS (renda por mês) ────────────────
CREATE TABLE IF NOT EXISTS public.ganhos (
  ano        int           NOT NULL CHECK (ano BETWEEN 2024 AND 2040),
  mes        int           NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor      numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  updated_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (ano, mes)
);
CREATE INDEX IF NOT EXISTS idx_ganhos_periodo ON public.ganhos (ano DESC, mes DESC);

-- ──────────────── APP CONFIG (chave/valor único — saldo etc) ────────────────
CREATE TABLE IF NOT EXISTS public.app_config (
  chave      text          PRIMARY KEY,
  valor      numeric(12,2),
  updated_at timestamptz   NOT NULL DEFAULT now()
);

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

-- ──────────────── ROTINA (blocos do dia) ────────────────
-- Um registro = um bloco fixo do dia. Refeições, treino, contratos, estudo e sono.
-- hora_fim é opcional: refeição é instante, contrato e treino são faixa.
CREATE TABLE IF NOT EXISTS public.rotina (
  id          bigserial   PRIMARY KEY,
  hora_inicio time        NOT NULL,
  hora_fim    time,
  titulo      text        NOT NULL,
  detalhe     text,
  tipo        text        NOT NULL DEFAULT 'pessoal',
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rotina_hora ON public.rotina (hora_inicio);
CREATE INDEX IF NOT EXISTS idx_rotina_tipo ON public.rotina (tipo);

-- ──────────────── ACADEMICO (formações e trilhas longas) ────────────────
CREATE TABLE IF NOT EXISTS public.academico (
  id bigserial PRIMARY KEY,
  nome text NOT NULL,
  instituicao text,
  tipo text NOT NULL DEFAULT 'curso',
  total_aulas int CHECK (total_aulas >= 0),
  aulas_feitas int NOT NULL DEFAULT 0 CHECK (aulas_feitas >= 0),
  status text NOT NULL DEFAULT 'em_andamento',
  prazo date,
  detalhe text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_academico_status ON public.academico (status);

-- ──────────────── EMPRESAS (empresas e contratos) ────────────────
-- valor_mensal negativo = saída (folha). Positivo = receita recorrente.
CREATE TABLE IF NOT EXISTS public.empresas (
  id bigserial PRIMARY KEY,
  nome text NOT NULL,
  papel text NOT NULL DEFAULT 'contratante',
  cliente_final text,
  valor_mensal numeric(12,2) NOT NULL DEFAULT 0,
  dia_pagamento text,
  status text NOT NULL DEFAULT 'ativo',
  detalhe text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_empresas_status ON public.empresas (status);

-- ──────────────── RIEMANN (backlog da hipótese) ────────────────
CREATE TABLE IF NOT EXISTS public.riemann (
  id bigserial PRIMARY KEY,
  item text NOT NULL,
  categoria text NOT NULL DEFAULT 'aberto',
  status text NOT NULL DEFAULT 'aberto',
  detalhe text,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_riemann_ordem ON public.riemann (ordem);

-- ──────────────── RIEMANN · BIBLIOGRAFIA ────────────────
-- Os 79 itens do arsenal, por camada e programa. nucleo = inegociável.
CREATE TABLE IF NOT EXISTS public.riemann_biblio (
  id bigserial PRIMARY KEY,
  titulo text NOT NULL,
  autor text,
  publicacao text,
  grupo text NOT NULL DEFAULT 'camada0',
  nucleo boolean NOT NULL DEFAULT false,
  nota text,
  lido boolean NOT NULL DEFAULT false,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_biblio_grupo ON public.riemann_biblio (grupo);
CREATE INDEX IF NOT EXISTS idx_biblio_ordem ON public.riemann_biblio (ordem);

-- ──────────────── RIEMANN · TRILHA ────────────────
CREATE TABLE IF NOT EXISTS public.riemann_trilha (
  id bigserial PRIMARY KEY,
  fase text NOT NULL,
  foco text NOT NULL,
  nucleo text,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

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
ALTER TABLE public.ganhos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livros        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aulas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kaizen        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotina        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academico     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riemann       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riemann_biblio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riemann_trilha ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas (caso já existam de tentativas anteriores)
DROP POLICY IF EXISTS "allow all"       ON public.metas;
DROP POLICY IF EXISTS "auth_all_metas"  ON public.metas;
DROP POLICY IF EXISTS "allow all"       ON public.gastos;
DROP POLICY IF EXISTS "auth_all_gastos" ON public.gastos;
DROP POLICY IF EXISTS "auth_all_ganhos" ON public.ganhos;
DROP POLICY IF EXISTS "auth_all_app_config" ON public.app_config;
DROP POLICY IF EXISTS "allow all"       ON public.certificacoes;
DROP POLICY IF EXISTS "auth_all_certs"  ON public.certificacoes;
DROP POLICY IF EXISTS "allow all"       ON public.livros;
DROP POLICY IF EXISTS "auth_all_livros" ON public.livros;
DROP POLICY IF EXISTS "auth_all_aulas"  ON public.aulas;
DROP POLICY IF EXISTS "auth_all_kaizen" ON public.kaizen;
DROP POLICY IF EXISTS "auth_all_rotina" ON public.rotina;
DROP POLICY IF EXISTS "auth_all_academico" ON public.academico;
DROP POLICY IF EXISTS "auth_all_empresas" ON public.empresas;
DROP POLICY IF EXISTS "auth_all_riemann" ON public.riemann;
DROP POLICY IF EXISTS "auth_all_riemann_biblio" ON public.riemann_biblio;
DROP POLICY IF EXISTS "auth_all_riemann_trilha" ON public.riemann_trilha;

-- Cria policies novas — só authenticated
CREATE POLICY "auth_all_metas"  ON public.metas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_gastos" ON public.gastos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_ganhos" ON public.ganhos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_app_config" ON public.app_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_certs"  ON public.certificacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_livros" ON public.livros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_aulas"  ON public.aulas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_kaizen" ON public.kaizen
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_rotina" ON public.rotina
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_academico" ON public.academico
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_empresas" ON public.empresas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_riemann" ON public.riemann
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_riemann_biblio" ON public.riemann_biblio
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_riemann_trilha" ON public.riemann_trilha
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
