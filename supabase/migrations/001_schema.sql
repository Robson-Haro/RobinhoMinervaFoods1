CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS processos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  responsavel TEXT NOT NULL DEFAULT 'Robson Ramos',
  cargo_buscado TEXT,
  descritivo TEXT,
  sensibilidade TEXT DEFAULT 'normal',
  limiar_aprovado INTEGER DEFAULT 70,
  limiar_potencial INTEGER DEFAULT 40,
  pesos JSONB DEFAULT '{"d1":20,"d2":10,"d3":15,"d4":10,"d5":10,"d8":15,"d9":10,"d10":10}',
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'ativo',
  idioma TEXT DEFAULT 'pt',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS triagens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  processo_id UUID REFERENCES processos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  total INTEGER DEFAULT 0,
  aprovados INTEGER DEFAULT 0,
  potenciais INTEGER DEFAULT 0,
  reprovados INTEGER DEFAULT 0,
  score_medio NUMERIC(5,2) DEFAULT 0,
  mapeamento JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidatos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triagem_id UUID REFERENCES triagens(id) ON DELETE CASCADE,
  processo_id UUID REFERENCES processos(id) ON DELETE CASCADE,
  nome TEXT, telefone TEXT, email TEXT, linkedin_url TEXT,
  cidade TEXT, estado TEXT, cargo_atual TEXT, empresa_atual TEXT,
  experiencias TEXT, formacao TEXT, idiomas TEXT,
  salario_pret NUMERIC(10,2),
  score_d1 NUMERIC(5,2) DEFAULT 0, score_d2 NUMERIC(5,2) DEFAULT 0,
  score_d3 NUMERIC(5,2) DEFAULT 0, score_d4 NUMERIC(5,2) DEFAULT 0,
  score_d5 NUMERIC(5,2) DEFAULT 0, score_d8 NUMERIC(5,2) DEFAULT 0,
  score_d9 NUMERIC(5,2) DEFAULT 0, score_d10 NUMERIC(5,2) DEFAULT 0,
  score_custom JSONB DEFAULT '{}',
  score_total NUMERIC(5,2) DEFAULT 0,
  classificacao TEXT DEFAULT 'pendente',
  destaque BOOLEAN DEFAULT FALSE,
  detalhes JSONB DEFAULT '{}',
  wpp_enviado BOOLEAN DEFAULT FALSE,
  wpp_enviado_at TIMESTAMPTZ,
  dados_brutos JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS configs_globais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chave TEXT UNIQUE NOT NULL,
  valor JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidatos_triagem ON candidatos(triagem_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_score ON candidatos(score_total DESC);
CREATE INDEX IF NOT EXISTS idx_candidatos_classe ON candidatos(classificacao);

ALTER TABLE processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE triagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configs_globais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all" ON processos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON triagens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON candidatos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON configs_globais FOR ALL USING (true) WITH CHECK (true);
