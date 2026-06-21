# 🎙️ Módulo Soninha — Entrevistas por Voz com IA
**Robinho · Motor de Triagem Inteligente · Minerva Foods**
Documentação técnica preparatória — elaborada em 21/06/2026

---

## O que é o Módulo Soninha?

Soninha é o módulo de entrevistas por voz com IA integrado ao Robinho. O nome é uma homenagem à Sônia, Gerente Executiva de Gente e Gestão da Minerva Foods.

O módulo permite que candidatos realizem entrevistas por voz com uma IA conversacional, sem necessidade de agendar horário com uma recrutadora. A IA conduz a entrevista, transcreve as respostas, gera um relatório de recomendação e salva tudo no Supabase.

---

## Fluxo completo

```
1. Recrutadora sobe planilha (nome + e-mail dos candidatos)
2. Robinho envia e-mail de convite com link único por candidato
3. Candidato clica no link → abre interface de voz no navegador
4. IA conduz a entrevista (perguntas geradas pelo descritivo da vaga)
5. Recrutadora pode revisar/ajustar as perguntas antes de enviar
6. IA transcreve e analisa as respostas em tempo real
7. Relatório de recomendação salvo no Supabase
8. Dashboard da recrutadora mostra resultado por candidato
```

---

## Arquitetura técnica definida

### Stack escolhida

| Camada | Tecnologia | Motivo |
|---|---|---|
| Voz (STT + TTS) | **ElevenLabs Conversational AI** | Melhor qualidade de voz em português, latência < 300ms, suporte nativo a PT-BR |
| IA conversacional | **Anthropic Claude (claude-sonnet-4-6)** | Já integrado ao Robinho, qualidade superior em entrevistas estruturadas |
| E-mail de convite | **Resend** | Gratuito até 3.000 e-mails/mês, SDK React nativo, integra com Vercel |
| Banco de dados | **Supabase** (já existe) | Tabelas novas: `entrevistas_soninha`, `respostas_soninha` |
| Deploy | **Vercel** (já existe) | Auto-deploy via GitHub |
| WebSocket proxy | **Supabase Edge Functions** | Necessário para não expor API keys no frontend |

### Por que ElevenLabs e não outras opções?

- **Gemini Live API**: excelente tecnologia, mas requer Cloud Run (Google) — adiciona complexidade ao deploy
- **OpenAI Realtime API**: boa opção, mas custo maior e sem suporte nativo a vozes em PT-BR de alta qualidade
- **Vapi**: orquestrador completo, mas $450/mês no plano mínimo atual — inviável para MVP
- **ElevenLabs**: $22/mês (Creator) cobre ~2.000 minutos de voz/mês — suficiente para fase piloto. Voz feminina "Rachel" ou "Bella" pode representar a Soninha

---

## Novas tabelas no Supabase

```sql
-- Tabela de entrevistas agendadas
CREATE TABLE entrevistas_soninha (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  processo_id     UUID REFERENCES processos(id) ON DELETE CASCADE,
  candidato_nome  TEXT NOT NULL,
  candidato_email TEXT NOT NULL,
  token_unico     TEXT UNIQUE NOT NULL,  -- link único por candidato
  status          TEXT DEFAULT 'aguardando' 
                  CHECK (status IN ('aguardando','em_andamento','concluida','expirada')),
  perguntas       JSONB DEFAULT '[]',    -- array de perguntas configuradas
  email_enviado   BOOLEAN DEFAULT FALSE,
  email_enviado_at TIMESTAMPTZ,
  agendado_para   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de respostas e análise
CREATE TABLE respostas_soninha (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entrevista_id    UUID REFERENCES entrevistas_soninha(id) ON DELETE CASCADE,
  transcricao      JSONB DEFAULT '[]',  -- [{pergunta, resposta, timestamp}]
  duracao_minutos  NUMERIC(5,2),
  score_geral      NUMERIC(5,2),
  dimensoes        JSONB DEFAULT '{}',  -- scores por dimensão (comunicação, técnico, fit)
  recomendacao     TEXT CHECK (recomendacao IN ('recomendar','considerar','nao_recomendar')),
  justificativa    TEXT,                -- relatório em linguagem natural da IA
  audio_url        TEXT,                -- URL do áudio no Supabase Storage (opcional)
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Novas variáveis de ambiente necessárias

Adicionar na Vercel quando for implementar:

```
VITE_ELEVENLABS_API_KEY     = sk_...  (ElevenLabs)
VITE_ELEVENLABS_AGENT_ID    = ...     (ID do agente de voz criado no ElevenLabs)
RESEND_API_KEY              = re_...  (Resend — variável de servidor, não VITE_)
VITE_ANTHROPIC_KEY          = sk-ant-... (já planejado, para análise das respostas)
```

**Atenção:** `RESEND_API_KEY` não pode ter prefixo `VITE_` — é uma chave de servidor que deve rodar em Supabase Edge Function, nunca exposta no browser.

---

## Estrutura de arquivos a criar

```
src/
  soninha/
    SoninhaTab.tsx          ← Aba principal do módulo no Robinho
    UploadCandidatos.tsx    ← Upload de planilha com nome + e-mail
    ConfigurarEntrevista.tsx ← Descritivo + perguntas geradas pela IA + edição manual
    SalaEntrevista.tsx      ← Interface de voz para o candidato (link único)
    RelatorioSoninha.tsx    ← Dashboard com resultado por candidato
    EnviarConvites.tsx      ← Disparo de e-mails via Resend

supabase/
  migrations/
    002_soninha_schema.sql  ← Script SQL das novas tabelas

supabase/
  functions/
    send-invite/            ← Edge Function para enviar e-mail via Resend
      index.ts
    voice-proxy/            ← Edge Function WebSocket proxy para ElevenLabs
      index.ts
```

---

## Geração de perguntas pela IA

A IA (Claude) vai gerar as perguntas automaticamente com base no descritivo da vaga já cadastrado no processo do Robinho. A recrutadora pode:

- Aceitar todas as perguntas geradas
- Editar qualquer pergunta
- Adicionar perguntas próprias
- Remover perguntas

**Prompt base para geração:**

```
Você é um Selecionador Estratégico da Minerva Foods especializado em 
entrevistas por competência (método STAR).

Gere {N} perguntas de entrevista para a vaga de {CARGO}.

Descritivo da vaga:
{DESCRITIVO}

Conhecimentos técnicos exigidos:
{CONHECIMENTOS_TECNICOS}

Regras:
- Use a metodologia STAR (Situação, Tarefa, Ação, Resultado)
- Misture perguntas comportamentais e técnicas
- Tom: profissional mas acolhedor
- Idioma: português brasileiro
- Cada pergunta em uma linha separada, numerada
```

---

## Template do e-mail de convite

```html
Assunto: [Minerva Foods] Convite para Entrevista por Voz — {CARGO}

Olá, {NOME}!

Sua candidatura para a vaga de {CARGO} na Minerva Foods avançou para 
a próxima etapa: uma entrevista por voz com nossa assistente de seleção, 
a Soninha.

A entrevista dura aproximadamente {DURACAO} minutos e pode ser realizada 
de qualquer lugar, pelo seu navegador, sem instalar nada.

👉 Acesse sua entrevista: {LINK_UNICO}

O link expira em {PRAZO} dias.

Atenciosamente,
{RECRUTADORA}
Coordenação Global de Atração & Seleção
Minerva Foods
```

---

## Interface da Sala de Entrevista (candidato)

O candidato acessa o link único e vê:
1. Tela de boas-vindas com nome e cargo
2. Teste de microfone (confirmar que está funcionando)
3. Instruções breves (metodologia STAR explicada de forma simples)
4. Botão "Iniciar Entrevista"
5. Interface de voz: a Soninha faz as perguntas em voz alta e aguarda a resposta
6. Indicador visual de quando está gravando / quando a IA está falando
7. Tela final: "Entrevista concluída. Obrigado!"

---

## Relatório gerado pela IA para a recrutadora

Após a entrevista, a IA analisa a transcrição e gera:

```
CANDIDATO: {Nome}
VAGA: {Cargo}
DATA: {Data}
DURAÇÃO: {X} minutos

DIMENSÕES AVALIADAS:
├── Comunicação e clareza       XX/100
├── Aderência técnica           XX/100
├── Fit cultural Minerva        XX/100
├── Orientação a resultados     XX/100
└── SCORE GERAL                 XX/100

RECOMENDAÇÃO: ✅ Recomendar / ⚡ Considerar / ❌ Não recomendar

SÍNTESE DA ENTREVISTA:
{Parágrafo com análise qualitativa em linguagem natural}

PONTOS FORTES:
- {ponto 1}
- {ponto 2}

PONTOS DE ATENÇÃO:
- {ponto 1}

PRÓXIMO PASSO SUGERIDO: {recomendação de próxima etapa}
```

---

## Custos estimados por mês (fase piloto)

| Serviço | Plano | Custo |
|---|---|---|
| ElevenLabs (voz) | Creator | $22/mês (~2.000 min de voz) |
| Resend (e-mail) | Free | R$ 0 (até 3.000 e-mails/mês) |
| Anthropic Claude (análise) | Pay-per-use | ~R$ 0,05 por entrevista |
| Supabase | Free | R$ 0 |
| Vercel | Hobby | R$ 0 |
| **TOTAL** | | **~R$ 120/mês** |

Para 100 entrevistas/mês: custo de **R$ 1,20 por candidato entrevistado.**

---

## Ordem de implementação (quando Robson retornar)

**Sessão 1 — Backend e banco:**
1. Criar `002_soninha_schema.sql` e rodar no Supabase
2. Criar Supabase Edge Function `send-invite` (Resend)
3. Criar conta no ElevenLabs e configurar agente de voz "Soninha"

**Sessão 2 — Interface de convite:**
1. `UploadCandidatos.tsx` — upload de planilha
2. `ConfigurarEntrevista.tsx` — descritivo + geração de perguntas pela IA
3. `EnviarConvites.tsx` — disparo de e-mails

**Sessão 3 — Sala de entrevista:**
1. `SalaEntrevista.tsx` — interface de voz com ElevenLabs
2. Supabase Edge Function `voice-proxy` (WebSocket seguro)
3. Transcrição e salvamento no Supabase

**Sessão 4 — Relatório e dashboard:**
1. Análise das respostas via Claude
2. `RelatorioSoninha.tsx` — dashboard para recrutadoras
3. Integração com aba Results do Robinho

---

## Notas finais

- O módulo Soninha será uma aba nova no Robinho, ao lado de Dashboard, Parâmetros, Triagem, Resultados, WhatsApp e Configurações
- O link de entrevista terá domínio próprio: `soninha.robinho.minervafoods.com` (a definir)
- A voz da Soninha será feminina, em PT-BR, com tom acolhedor e profissional
- As entrevistas ficarão armazenadas no Supabase por 90 dias por padrão

---

*Documento preparado por Robson Ramos & Claude (Anthropic)*  
*Minerva Foods — Coordenação Global de Atração & Seleção*  
*21/06/2026 — Versão 1.0*
