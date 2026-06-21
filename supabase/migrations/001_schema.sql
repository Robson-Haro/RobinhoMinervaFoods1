-- ============================================================
-- ROBINHO · MINERVA FOODS — Schema Supabase
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Habilitar extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: processos
-- Armazena cada processo seletivo configurado
-- ============================================================
CREATE TABLE IF NOT EXISTS processos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          TEXT NOT NULL,
  responsavel   TEXT NOT NULL DEFAULT 'Robson Ramos',
  cargo_buscado TEXT,
  descritivo    TEXT,
  sensibilidade TEXT DEFAULT 'normal' CHECK (sensibilidade IN ('strict','normal','flex')),
  limiar_aprovado   INTEGER DEFAULT 70,
  limiar_potencial  INTEGER DEFAULT 40,
  pesos         JSONB DEFAULT '{"d1":20,"d2":10,"d3":15,"d4":10,"d5":10,"d8":15,"d9":10,"d10":10}',
  config        JSONB DEFAULT '{}',
  status        TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','pausado','encerrado')),
  idioma        TEXT DEFAULT 'pt' CHECK (idioma IN ('pt','en','es')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: triagens
-- Cada execução de triagem vinculada a um processo
-- ============================================================
CREATE TABLE IF NOT EXISTS triagens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  processo_id UUID REFERENCES processos(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  total       INTEGER DEFAULT 0,
  aprovados   INTEGER DEFAULT 0,
  potenciais  INTEGER DEFAULT 0,
  reprovados  INTEGER DEFAULT 0,
  score_medio NUMERIC(5,2) DEFAULT 0,
  mapeamento  JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: candidatos
-- Cada candidato avaliado, vinculado a uma triagem
-- ============================================================
CREATE TABLE IF NOT EXISTS candidatos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triagem_id   UUID REFERENCES triagens(id) ON DELETE CASCADE,
  processo_id  UUID REFERENCES processos(id) ON DELETE CASCADE,

  -- Dados pessoais
  nome         TEXT,
  telefone     TEXT,
  email        TEXT,
  linkedin_url TEXT,
  cidade       TEXT,
  estado       TEXT,

  -- Dados profissionais
  cargo_atual    TEXT,
  empresa_atual  TEXT,
  experiencias   TEXT,
  formacao       TEXT,
  idiomas        TEXT,
  salario_pret   NUMERIC(10,2),

  -- Scores por dimensão
  score_d1   NUMERIC(5,2) DEFAULT 0,  -- Aderência descritivo
  score_d2   NUMERIC(5,2) DEFAULT 0,  -- LinkedIn
  score_d3   NUMERIC(5,2) DEFAULT 0,  -- Tempo na posição
  score_d4   NUMERIC(5,2) DEFAULT 0,  -- Liderança
  score_d5   NUMERIC(5,2) DEFAULT 0,  -- Formação
  score_d8   NUMERIC(5,2) DEFAULT 0,  -- Indústria carne
  score_d9   NUMERIC(5,2) DEFAULT 0,  -- Idiomas
  score_d10  NUMERIC(5,2) DEFAULT 0,  -- Localização
  score_custom JSONB DEFAULT '{}',

  -- Score final e classificação
  score_total   NUMERIC(5,2) DEFAULT 0,
  classificacao TEXT DEFAULT 'pendente' CHECK (classificacao IN ('aprovado','potencial','reprovado','pendente')),
  destaque      BOOLEAN DEFAULT FALSE,
  detalhes      JSONB DEFAULT '{}',

  -- Comunicação
  wpp_enviado   BOOLEAN DEFAULT FALSE,
  wpp_enviado_at TIMESTAMPTZ,

  -- Dados brutos originais
  dados_brutos  JSONB DEFAULT '{}',

  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: configs_globais
-- Configurações persistidas por usuário/equipe
-- ============================================================
CREATE TABLE IF NOT EXISTS configs_globais (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chave      TEXT UNIQUE NOT NULL,
  valor      JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_candidatos_triagem    ON candidatos(triagem_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_processo   ON candidatos(processo_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_score      ON candidatos(score_total DESC);
CREATE INDEX IF NOT EXISTS idx_candidatos_classe     ON candidatos(classificacao);
CREATE INDEX IF NOT EXISTS idx_triagens_processo     ON triagens(processo_id);

-- ============================================================
-- TRIGGER: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_processos_updated
  BEFORE UPDATE ON processos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS (Row Level Security) — desativado para MVP
-- Ativar quando tiver autenticação por equipe
-- ============================================================
ALTER TABLE processos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE triagens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidatos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE configs_globais ENABLE ROW LEVEL SECURITY;

-- Política pública para MVP (ajustar para produção com auth)
CREATE POLICY "public_all" ON processos    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON triagens     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON candidatos   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON configs_globais FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- DADOS INICIAIS
-- ============================================================
INSERT INTO configs_globais (chave, valor) VALUES
  ('idioma_padrao', '"pt"'),
  ('version', '"1.7.0"'),
  ('gupy_integration', 'false')
ON CONFLICT (chave) DO NOTHING;
