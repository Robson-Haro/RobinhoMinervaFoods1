// ============================================================
// ENGINE DE TRIAGEM — Alta Precisão · Robinho v1.7
// ============================================================

export type Sensibilidade = 'strict' | 'normal' | 'flex'

export interface ConfigTriagem {
  descritivo: string
  cargo_buscado: string
  sensibilidade: Sensibilidade
  limiar_aprovado: number
  limiar_potencial: number
  pesos: {
    d1: number; d2: number; d3: number; d4: number
    d5: number; d8: number; d9: number; d10: number
  }
  config: {
    d3_cargo?: string
    d3_tempo_min?: number
    d3_penalizar?: boolean
    d4_ativo?: boolean
    d4_tempo_min?: number
    d5_formacoes?: string[]
    d5_nivel_min?: string
    d8_eliminatorio?: boolean
    d9_idioma1?: string
    d9_nivel1?: string
    d9_idioma2?: string
    d9_nivel2?: string
    d10_cidades?: string[]
    d10_tolerancia?: string
    salario_min?: number
    salario_max?: number
  }
}

export interface DadosCandidato {
  nome?: string
  telefone?: string
  email?: string
  linkedin_url?: string
  cidade?: string
  estado?: string
  cargo_atual?: string
  empresa_atual?: string
  experiencias?: string
  formacao?: string
  idiomas?: string
  salario_pret?: string
  dados_brutos: Record<string, string>
}

export interface ResultadoScore {
  score_d1: number; score_d2: number; score_d3: number; score_d4: number
  score_d5: number; score_d8: number; score_d9: number; score_d10: number
  score_total: number
  classificacao: 'aprovado' | 'potencial' | 'reprovado'
  destaque: boolean
  detalhes: Record<string, string>
}

// ── Normalização de texto ───────────────────────────────────
function norm(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

// ── Extrair tokens únicos ───────────────────────────────────
function tokens(s: string): string[] {
  return [...new Set(norm(s).split(' ').filter(w => w.length > 2))]
}

// ── Radicais (stemming simples pt/en/es) ───────────────────
function stem(w: string): string {
  return w
    .replace(/(ções|ção|ments?|ings?|ados?|idas?|ores?|idos?)$/, '')
    .replace(/(mente|mente|ando|endo|ando)$/, '')
    .replace(/(ar|er|ir|es|os|as)$/, '')
}

// ── Similaridade entre dois tokens ─────────────────────────
function similar(a: string, b: string, sens: Sensibilidade): boolean {
  if (a === b) return true
  if (sens === 'strict') return false
  // normal: prefixo comum >= 5 chars
  if (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))) return true
  if (sens === 'flex') {
    return stem(a) === stem(b)
  }
  return false
}

// ── Similaridade entre dois textos ─────────────────────────
function scoreSimilaridade(ref: string, alvo: string, sens: Sensibilidade): number {
  if (!ref || !alvo) return 0
  const tRef = tokens(ref)
  const tAlvo = tokens(alvo)
  if (!tRef.length) return 0
  let hits = 0
  for (const r of tRef) {
    if (tAlvo.some(a => similar(r, a, sens))) hits++
  }
  return Math.round((hits / tRef.length) * 100) / 100
}

// ── D1: Aderência ao Descritivo ────────────────────────────
function calcD1(cfg: ConfigTriagem, d: DadosCandidato): { score: number; detalhe: string } {
  const perfil = [
    d.cargo_atual, d.empresa_atual, d.experiencias,
    d.formacao, d.idiomas
  ].filter(Boolean).join(' ')

  if (!perfil || !cfg.descritivo) return { score: 0, detalhe: 'Sem dados para comparar' }

  const sim = scoreSimilaridade(cfg.descritivo, perfil, cfg.sensibilidade)
  const score = Math.round(sim * 100)
  return { score: Math.min(score, 100), detalhe: `Similaridade: ${(sim * 100).toFixed(1)}%` }
}

// ── D2: LinkedIn ────────────────────────────────────────────
function calcD2(cfg: ConfigTriagem, d: DadosCandidato): { score: number; detalhe: string } {
  const url = d.linkedin_url || ''
  if (!url || url === '—' || !url.includes('linkedin')) return { score: 0, detalhe: 'Sem perfil LinkedIn' }
  // Bônus se URL válida; integração real viria via LinkedIn API
  return { score: 70, detalhe: 'Perfil LinkedIn presente' }
}

// ── D3: Tempo na Posição ────────────────────────────────────
function calcD3(cfg: ConfigTriagem, d: DadosCandidato): { score: number; detalhe: string } {
  const exp = norm(d.experiencias || d.cargo_atual || '')
  const cargo = norm(cfg.config.d3_cargo || cfg.cargo_buscado || '')
  const tempoMin = cfg.config.d3_tempo_min || 3

  if (!exp) {
    return cfg.config.d3_penalizar
      ? { score: 0, detalhe: 'Sem histórico — penalizado' }
      : { score: 30, detalhe: 'Sem histórico — não penalizado' }
  }

  // Detectar menção ao cargo
  const temCargo = cargo.split(' ').some(t => t.length > 3 && exp.includes(t))

  // Estimativa de anos por padrão "X anos" / "X years" / "X años"
  const matchAnos = exp.match(/(\d+)\s*(ano|year|año|yr)/i)
  const anos = matchAnos ? parseInt(matchAnos[1]) : (temCargo ? 2 : 0)

  let score = 0
  if (anos === 0) score = 0
  else if (anos < 1) score = 20
  else if (anos < 2) score = 50
  else if (anos < tempoMin) score = 65
  else if (anos < tempoMin + 2) score = 85
  else score = 100

  if (!temCargo && cfg.config.d3_penalizar) score = Math.round(score * 0.5)

  return { score, detalhe: `~${anos} anos na função` }
}

// ── D4: Liderança ───────────────────────────────────────────
const LIDERANCA_KW = ['gerente','gestor','manager','head','director','diretora','diretor',
  'coordenador','coordenadora','supervisor','supervisora','lider','leader','vp ','vice']

function calcD4(cfg: ConfigTriagem, d: DadosCandidato): { score: number; detalhe: string } {
  if (!cfg.config.d4_ativo) return { score: 100, detalhe: 'Não avaliado' }
  const txt = norm([d.cargo_atual, d.experiencias].join(' '))
  const temLider = LIDERANCA_KW.some(k => txt.includes(k))
  if (!temLider) return { score: 10, detalhe: 'Sem experiência em liderança identificada' }
  const matchAnos = txt.match(/(\d+)\s*(ano|year|año)/i)
  const anos = matchAnos ? parseInt(matchAnos[1]) : 2
  const min = cfg.config.d4_tempo_min || 2
  const score = anos >= min ? 100 : Math.round((anos / min) * 80)
  const destaque = anos >= min
  return { score, detalhe: `Liderança ~${anos} anos${destaque ? ' ⭐' : ''}` }
}

// ── D5: Formação Acadêmica ──────────────────────────────────
const NIVEL_ORDER = ['tecnico','medio','superior','pos','mba','especializacao','mestrado','doutorado','phd']
const NIVEL_MAP: Record<string, number> = {
  'qualquer': 0, 'tecnico': 1, 'medio': 1, 'superior': 2,
  'pos': 3, 'mba': 3, 'especializacao': 3, 'mestrado': 4, 'doutorado': 5, 'phd': 5
}

function calcD5(cfg: ConfigTriagem, d: DadosCandidato): { score: number; detalhe: string } {
  const form = norm(d.formacao || '')
  if (!form) return { score: 20, detalhe: 'Formação não informada' }

  const formacoes = (cfg.config.d5_formacoes || []).map(norm)
  const nivelMin = norm(cfg.config.d5_nivel_min || 'qualquer')

  // Checar área de formação
  const matchArea = !formacoes.length || formacoes.some(f => form.includes(f))

  // Checar nível
  const nivelCandidato = NIVEL_ORDER.find(n => form.includes(n)) || 'qualquer'
  const nivelMinVal = NIVEL_MAP[nivelMin] || 0
  const nivelCandVal = NIVEL_MAP[nivelCandidato] || 0
  const atendeNivel = nivelCandVal >= nivelMinVal

  if (!matchArea && !atendeNivel) return { score: 20, detalhe: 'Formação fora do perfil' }
  if (!matchArea) return { score: 50, detalhe: 'Nível ok, área divergente' }
  if (!atendeNivel) return { score: 50, detalhe: 'Área ok, nível abaixo do mínimo' }
  return { score: 100, detalhe: `Formação aderente: ${nivelCandidato}` }
}

// ── D8: Indústria de Carne ──────────────────────────────────
const CARNE_KW = ['frigorifico','bovino','suino','frango','carnes','jbs','marfrig','brf',
  'minerva','slaughterhouse','meatpacking','beef','pork','poultry','abatedouro',
  'frigorifico','carne','proteina animal']
const ALIMENTO_KW = ['alimentos','food','bebidas','laticinios','cereais','snacks','fmcg',
  'nestle','unilever','ambev','danone','cpg','consumo']

function calcD8(cfg: ConfigTriagem, d: DadosCandidato): { score: number; detalhe: string } {
  const txt = norm([d.empresa_atual, d.experiencias].join(' '))
  const temCarne = CARNE_KW.some(k => txt.includes(k))
  const temAlimento = ALIMENTO_KW.some(k => txt.includes(k))

  if (temCarne) return { score: 100, detalhe: 'Experiência em indústria de carne ✓' }
  if (temAlimento) return { score: 60, detalhe: 'Experiência em alimentos (não carne)' }
  if (cfg.config.d8_eliminatorio) return { score: 0, detalhe: 'ELIMINADO: sem experiência em carne' }
  return { score: 10, detalhe: 'Sem experiência na indústria' }
}

// ── D9: Idiomas ─────────────────────────────────────────────
const NIVEL_IDIOMA: Record<string, number> = {
  basico: 1, basic: 1, basica: 1,
  intermediario: 2, intermediate: 2, intermedio: 2,
  avancado: 3, advanced: 3, avanzado: 3,
  fluente: 4, fluent: 4, fluido: 4, native: 4, nativo: 4, nativa: 4
}

function nivelIdioma(txt: string, idioma: string): number {
  const t = norm(txt)
  if (!t.includes(norm(idioma))) return 0
  for (const [k, v] of Object.entries(NIVEL_IDIOMA)) {
    if (t.includes(k)) return v
  }
  return 1 // mencionou mas sem nível
}

function calcD9(cfg: ConfigTriagem, d: DadosCandidato): { score: number; detalhe: string } {
  const txt = d.idiomas || d.experiencias || ''
  const i1 = cfg.config.d9_idioma1 || 'ingles'
  const n1Min = NIVEL_IDIOMA[norm(cfg.config.d9_nivel1 || 'avancado')] || 3
  const i2 = cfg.config.d9_idioma2 || ''
  const n2Min = NIVEL_IDIOMA[norm(cfg.config.d9_nivel2 || 'intermediario')] || 2

  const nv1 = nivelIdioma(txt, i1)
  const nv2 = i2 ? nivelIdioma(txt, i2) : n2Min

  const score1 = nv1 >= n1Min ? 100 : Math.round((nv1 / n1Min) * 70)
  const score2 = i2 ? (nv2 >= n2Min ? 100 : Math.round((nv2 / n2Min) * 70)) : 100
  const score = Math.round((score1 * 0.6) + (score2 * 0.4))

  return {
    score,
    detalhe: `${i1}: nível ${nv1}/4${i2 ? ` | ${i2}: nível ${nv2}/4` : ''}`
  }
}

// ── D10: Localização ────────────────────────────────────────
function calcD10(cfg: ConfigTriagem, d: DadosCandidato): { score: number; detalhe: string } {
  const cidade = norm(d.cidade || '')
  const estado = norm(d.estado || '')
  const cidades = (cfg.config.d10_cidades || []).map(norm)
  const tol = cfg.config.d10_tolerancia || 'estado'

  if (!cidades.length) return { score: 80, detalhe: 'Sem restrição de localização' }
  if (!cidade) return { score: 40, detalhe: 'Localização não informada' }

  if (cidades.some(c => cidade.includes(c) || c.includes(cidade))) {
    return { score: 100, detalhe: `Cidade: ${d.cidade} ✓` }
  }

  // Tolerância por estado (simplificado)
  if (tol !== 'exato' && estado) {
    const estadosCidades = cidades.map(c => c.split(' ').pop() || '')
    if (estadosCidades.some(e => estado.includes(e))) {
      return { score: 70, detalhe: `Mesmo estado: ${d.estado}` }
    }
  }

  return { score: 20, detalhe: `Fora da região: ${d.cidade}` }
}

// ── SCORE FINAL ─────────────────────────────────────────────
export function calcularScore(cfg: ConfigTriagem, d: DadosCandidato): ResultadoScore {
  const p = cfg.pesos
  const total_pesos = Object.values(p).reduce((s, v) => s + v, 0) || 100

  const r1 = calcD1(cfg, d)
  const r2 = calcD2(cfg, d)
  const r3 = calcD3(cfg, d)
  const r4 = calcD4(cfg, d)
  const r5 = calcD5(cfg, d)
  const r8 = calcD8(cfg, d)
  const r9 = calcD9(cfg, d)
  const r10 = calcD10(cfg, d)

  // Verificar eliminatório D8
  if (r8.score === 0 && cfg.config.d8_eliminatorio) {
    return {
      score_d1: r1.score, score_d2: r2.score, score_d3: r3.score, score_d4: r4.score,
      score_d5: r5.score, score_d8: 0, score_d9: r9.score, score_d10: r10.score,
      score_total: 0,
      classificacao: 'reprovado',
      destaque: false,
      detalhes: {
        d1: r1.detalhe, d2: r2.detalhe, d3: r3.detalhe, d4: r4.detalhe,
        d5: r5.detalhe, d8: r8.detalhe, d9: r9.detalhe, d10: r10.detalhe,
        eliminado: 'Critério eliminatório: Indústria de Carne'
      }
    }
  }

  const score_total = Math.round(
    (r1.score * p.d1 + r2.score * p.d2 + r3.score * p.d3 + r4.score * p.d4 +
     r5.score * p.d5 + r8.score * p.d8 + r9.score * p.d9 + r10.score * p.d10) / total_pesos
  )

  const classificacao =
    score_total >= cfg.limiar_aprovado ? 'aprovado'
    : score_total >= cfg.limiar_potencial ? 'potencial'
    : 'reprovado'

  const destaque = classificacao === 'aprovado' && score_total >= 80

  return {
    score_d1: r1.score, score_d2: r2.score, score_d3: r3.score, score_d4: r4.score,
    score_d5: r5.score, score_d8: r8.score, score_d9: r9.score, score_d10: r10.score,
    score_total,
    classificacao,
    destaque,
    detalhes: {
      d1: r1.detalhe, d2: r2.detalhe, d3: r3.detalhe, d4: r4.detalhe,
      d5: r5.detalhe, d8: r8.detalhe, d9: r9.detalhe, d10: r10.detalhe,
    }
  }
}
