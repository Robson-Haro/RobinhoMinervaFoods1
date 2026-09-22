export type Sensibilidade = 'strict' | 'normal' | 'flex'

export interface ExperienciaProfissional {
  cargo?: string
  empresa?: string
  atividades?: string
  inicioAno?: number
  inicioMes?: number
  fimAno?: number
  fimMes?: number
  atual?: boolean
}

export interface ConfigTriagem {
  descritivo: string; cargo_buscado: string; sensibilidade: Sensibilidade
  limiar_aprovado: number; limiar_potencial: number
  pesos: { d1: number; d2: number; d3: number; d4: number; d5: number; d8: number; d9: number; d10: number }
  config: {
    d3_cargo?: string; d3_tempo_min?: number; d3_penalizar?: boolean
    d4_ativo?: boolean; d4_tempo_min?: number
    d5_formacoes?: string[]; d5_nivel_min?: string
    d8_ativo?: boolean; d8_eliminatorio?: boolean
    d9_idioma1?: string; d9_nivel1?: string; d9_idioma2?: string; d9_nivel2?: string
    d10_cidades?: string[]; d10_tolerancia?: string
    salario_min?: number; salario_max?: number
    /** Conhecimentos preferenciais: mantido por compatibilidade. */
    conhecimentos?: string[]
    /** Requisitos eliminatórios, com alternativas separadas por "|". */
    conhecimentos_obrigatorios?: string[]
    minimo_conhecimentos_obrigatorios?: number
    /** Títulos aceitos como alternativas ao cargo-alvo. */
    cargos_compativeis?: string[]
    /** Impede aprovação quando o título/carreira não comprovam a função-alvo. */
    cargo_obrigatorio?: boolean
    termos_excluidos?: string[]
  }
}

export interface DadosCandidato {
  nome?: string; telefone?: string; email?: string; linkedin_url?: string
  cidade?: string; estado?: string; cargo_atual?: string; empresa_atual?: string
  experiencias?: string; formacao?: string; idiomas?: string; salario_pret?: string
  historico?: ExperienciaProfissional[]
  dados_brutos: Record<string, unknown>
}

export interface ResultadoScore {
  score_d1: number; score_d2: number; score_d3: number; score_d4: number
  score_d5: number; score_d8: number; score_d9: number; score_d10: number
  score_total: number; classificacao: 'aprovado' | 'potencial' | 'reprovado'
  destaque: boolean; detalhes: Record<string, string>
}

type GateCargo = { ativo: boolean; atende: boolean; detalhes: string; titulosAderentes: string[] }
type GateConhecimentos = { atende: boolean; total: number; encontrados: string[]; faltantes: string[]; detalhes: string }

function norm(value: unknown): string {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
function tokens(value: unknown): string[] { return [...new Set(norm(value).split(' ').filter(Boolean))] }
function unique(values: string[]): string[] { return [...new Set(values.map(value => value.trim()).filter(Boolean))] }

const STOPWORDS = new Set(['para','com','sem','uma','das','dos','que','por','the','and','with','from','this','will','como','ser','sua','seu','suas','seus','mais','vaga','cargo','area','anos','ano','empresa','profissional','responsavel','responsabilidades','requisitos','desejavel','experiencia','atividades','conhecimento','conhecimentos','necessario','necessaria','atuar','atuacao','sobre','entre','pela','pelo','nas','nos','um','ou','de','da','do','em','na','no','a','o','e'])
const GENERIC_TITLE = new Set([...STOPWORDS,'analista','assistente','auxiliar','especialista','coordenador','coordenadora','gerente','gestor','gestora','supervisor','supervisora','consultor','consultora','tecnico','tecnica','diretor','diretora','head','manager','lider','leader','senior','seniora','junior','jr','sr','pleno','trainee','estagiario','estagiaria'])
const LIDER_KW = ['gerente','gestor','manager','head','director','diretora','diretor','coordenador','supervisor','lider','leader','vice']
const CARNE_KW = ['frigorifico','bovino','suino','frango','carnes','jbs','marfrig','brf','minerva','meatpacking','beef','pork','poultry','abatedouro','carne']
const ALIM_KW = ['alimentos','food','bebidas','laticinios','nestle','unilever','ambev','danone','fmcg','consumo']
const NIVEL_ORDER = ['tecnico','medio','superior','pos','mba','especializacao','mestrado','doutorado','phd']
const NIVEL_MAP: Record<string, number> = { qualquer: 0, tecnico: 1, medio: 1, superior: 2, pos: 3, mba: 3, especializacao: 3, mestrado: 4, doutorado: 5, phd: 5 }
const NIVEL_IDIOMA: Record<string, number> = { basico: 1, basic: 1, basica: 1, intermediario: 2, intermediate: 2, intermedio: 2, avancado: 3, advanced: 3, avanzado: 3, fluente: 4, fluent: 4, nativo: 4, native: 4 }

function meaningfulTokens(value: unknown): string[] { return tokens(value).filter(word => word.length > 3 && !STOPWORDS.has(word)) }
function roleTerms(value: unknown): string[] { return tokens(value).filter(word => word.length > 2 && !GENERIC_TITLE.has(word)) }
function stem(word: string): string { return word.replace(/(coes|cao|ments?|ings?|ados?|idas?|ores?)$/, '').replace(/(ar|er|ir|es|os|as)$/, '') }
function similar(a: string, b: string, sensibilidade: Sensibilidade): boolean {
  if (a === b) return true
  if (sensibilidade === 'strict') return false
  if (a.length >= 5 && b.length >= 5 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5)))) return true
  return sensibilidade === 'flex' && stem(a) === stem(b)
}
/** Comparação própria para filtros eliminatórios: não usa aproximação por prefixo. */
function sameRoleTerm(a: string, b: string): boolean { return a === b || (a.length >= 5 && b.length >= 5 && a.replace(/s$/, '') === b.replace(/s$/, '')) }
function roleCompatible(candidato: string, esperado: string): boolean {
  const alvo = roleTerms(esperado); const atual = roleTerms(candidato)
  return alvo.length > 0 && alvo.every(termo => atual.some(valor => sameRoleTerm(termo, valor)))
}
function contemExpressao(texto: unknown, termo: unknown, sensibilidade: Sensibilidade): boolean {
  const fonte = norm(texto); const alvo = norm(termo)
  if (!fonte || !alvo) return false
  // Espaços nas extremidades evitam falsos positivos como "SAP" em "sapo".
  if (` ${fonte} `.includes(` ${alvo} `)) return true
  // Siglas com números mudam de grafia com frequência (S/4HANA, S4 HANA, S4HANA).
  const compactoAlvo = alvo.replace(/\s/g, ''); const compactoFonte = fonte.replace(/\s/g, '')
  if (/\d/.test(compactoAlvo) && compactoFonte.includes(compactoAlvo)) return true
  const partes = meaningfulTokens(alvo); const disponiveis = tokens(fonte)
  return partes.length > 0 && partes.every(parte => disponiveis.some(valor => valor === parte || valueIsPluralOf(valor, parte) || similar(parte, valor, sensibilidade)))
}
function valueIsPluralOf(value: string, singular: string): boolean { return singular.length >= 3 && (value === singular + 's' || singular === value + 's') }
function configSeguro(cfg: ConfigTriagem): ConfigTriagem['config'] { return cfg.config || {} }
function titulosDoCandidato(d: DadosCandidato): string[] { return [d.cargo_atual, ...(d.historico || []).map(item => item.cargo)].map(value => String(value || '').trim()).filter(Boolean) }
function evidenciaProfissional(d: DadosCandidato): string { return [d.cargo_atual, d.experiencias, ...(d.historico || []).map(item => [item.cargo, item.empresa, item.atividades].filter(Boolean).join(' '))].filter(Boolean).join(' · ') }
function perfilCompleto(d: DadosCandidato): string { return [evidenciaProfissional(d), d.formacao, d.idiomas].filter(Boolean).join(' · ') }

function avaliarCargo(cfg: ConfigTriagem, d: DadosCandidato): GateCargo {
  const config = configSeguro(cfg)
  const alvo = config.d3_cargo || cfg.cargo_buscado
  const cargosAceitos = unique([alvo, ...(config.cargos_compativeis || [])].filter(Boolean))
  const termosAlvo = cargosAceitos.flatMap(roleTerms)
  const ativo = config.cargo_obrigatorio !== false && termosAlvo.length > 0
  if (!ativo) return { ativo: false, atende: true, detalhes: 'Cargo obrigatório não configurado', titulosAderentes: [] }
  const titulos = titulosDoCandidato(d)
  const titulosAderentes = titulos.filter(titulo => cargosAceitos.some(referencia => roleCompatible(titulo, referencia)))
  const termosExcluidos = (config.termos_excluidos || []).filter(termo => contemExpressao(evidenciaProfissional(d), termo, cfg.sensibilidade))
  if (termosExcluidos.length) return { ativo, atende: false, detalhes: `Termo de exclusão encontrado: ${termosExcluidos.join(', ')}`, titulosAderentes: [] }
  if (!titulos.length) return { ativo, atende: false, detalhes: 'Sem cargo ou histórico profissional para validar a função-alvo', titulosAderentes: [] }
  return titulosAderentes.length
    ? { ativo, atende: true, detalhes: `Título compatível: ${titulosAderentes.join(' | ')}`, titulosAderentes }
    : { ativo, atende: false, detalhes: `Cargo/família divergente. Esperado: ${cargosAceitos.join(' ou ')}`, titulosAderentes: [] }
}

function alternativas(requisito: string): string[] { return requisito.split(/\s*\|\s*|\s+ou\s+/i).map(item => item.trim()).filter(Boolean) }
function avaliarConhecimentos(cfg: ConfigTriagem, d: DadosCandidato): GateConhecimentos {
  const config = configSeguro(cfg)
  const requisitos = unique(config.conhecimentos_obrigatorios || [])
  if (!requisitos.length) return { atende: true, total: 0, encontrados: [], faltantes: [], detalhes: 'Sem conhecimento eliminatório configurado' }
  const evidencia = evidenciaProfissional(d)
  const encontrados: string[] = []; const faltantes: string[] = []
  for (const requisito of requisitos) {
    const achado = alternativas(requisito).find(alternativa => contemExpressao(evidencia, alternativa, cfg.sensibilidade))
    if (achado) encontrados.push(achado); else faltantes.push(requisito)
  }
  const minimo = Math.max(1, Math.min(requisitos.length, config.minimo_conhecimentos_obrigatorios || requisitos.length))
  const atende = encontrados.length >= minimo
  return { atende, total: requisitos.length, encontrados, faltantes, detalhes: `Requisitos comprovados: ${encontrados.length}/${requisitos.length}${faltantes.length ? ` · Faltantes: ${faltantes.join(', ')}` : ''}` }
}

function calcD1(cfg: ConfigTriagem, d: DadosCandidato) {
  const perfil = perfilCompleto(d)
  const preferencias = (configSeguro(cfg).conhecimentos || []).map(item => item.trim()).filter(Boolean)
  if (!perfil) return { score: 0, detalhe: 'Sem dados para comparar' }
  const tituloAlvo = meaningfulTokens(cfg.cargo_buscado)
  const tituloCandidato = meaningfulTokens([d.cargo_atual, ...(d.historico || []).map(item => item.cargo)].filter(Boolean).join(' '))
  const coberturaLiteral = tituloAlvo.length ? tituloAlvo.filter(termo => tituloCandidato.some(valor => similar(termo, valor, cfg.sensibilidade))).length / tituloAlvo.length : 0
  // Um título explicitamente cadastrado como equivalente é evidência forte e
  // não deve perder para a simples diferença de nomenclatura (ex.: Analista SAP).
  const gateCargo = avaliarCargo(cfg, d)
  const coberturaTitulo = gateCargo.ativo && gateCargo.atende ? Math.max(coberturaLiteral, 0.85) : coberturaLiteral
  const termosVaga = unique(meaningfulTokens(cfg.descritivo)).slice(0, 24)
  const termosPerfil = meaningfulTokens(perfil)
  const coberturaVaga = termosVaga.length ? termosVaga.filter(termo => termosPerfil.some(valor => similar(termo, valor, cfg.sensibilidade))).length / termosVaga.length : 0
  const base = Math.round(Math.min(1, coberturaTitulo * 0.65 + coberturaVaga * 0.35) * 100)
  if (!preferencias.length) return { score: base, detalhe: `Aderência de título: ${(coberturaTitulo * 100).toFixed(0)}% · Contexto da vaga: ${(coberturaVaga * 100).toFixed(0)}%` }
  const encontrados = preferencias.filter(termo => contemExpressao(evidenciaProfissional(d), termo, cfg.sensibilidade))
  const conhecimento = Math.round((encontrados.length / preferencias.length) * 100)
  return { score: Math.round(base * 0.7 + conhecimento * 0.3), detalhe: `Aderência: ${base}% · Preferenciais: ${encontrados.length}/${preferencias.length}${encontrados.length ? ` (${encontrados.join(', ')})` : ''}` }
}
/** LinkedIn é evidência de contato, não mérito profissional. */
function calcD2(_cfg: ConfigTriagem, d: DadosCandidato) { return { score: 100, detalhe: d.linkedin_url ? 'LinkedIn informado — critério neutro' : 'LinkedIn não informado — critério neutro' } }
function mesesDaExperiencia(item: ExperienciaProfissional): number | null {
  if (!item.inicioAno) return null
  const inicio = item.inicioAno * 12 + Math.max(1, item.inicioMes || 1)
  const hoje = new Date()
  const fim = item.atual || !item.fimAno ? hoje.getFullYear() * 12 + hoje.getMonth() + 1 : item.fimAno * 12 + Math.max(1, item.fimMes || 12)
  return Math.max(1, Math.min(600, fim - inicio + 1))
}
function calcD3(cfg: ConfigTriagem, d: DadosCandidato, cargo: GateCargo) {
  const config = configSeguro(cfg); const tempoMinimo = Math.max(1, config.d3_tempo_min || 3)
  const relevantes = (d.historico || []).filter(item => cargo.titulosAderentes.includes(String(item.cargo || '')))
  const meses = relevantes.reduce((total, item) => total + (mesesDaExperiencia(item) || 0), 0)
  if (!meses) return { score: cargo.atende ? 50 : (config.d3_penalizar ? 0 : 20), detalhe: cargo.atende ? 'Cargo aderente, mas sem datas suficientes para calcular o tempo' : 'Sem experiência relevante comprovável' }
  const anos = Math.round((meses / 12) * 10) / 10
  const score = anos >= tempoMinimo + 2 ? 100 : anos >= tempoMinimo ? 85 : anos >= tempoMinimo * 0.65 ? 65 : anos >= 1 ? 45 : 20
  return { score, detalhe: `${anos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ano(s) em cargo compatível` }
}
function calcD4(cfg: ConfigTriagem, d: DadosCandidato) {
  const config = configSeguro(cfg)
  if (!config.d4_ativo) return { score: 100, detalhe: 'Liderança não avaliada — critério neutro' }
  const texto = norm([d.cargo_atual, d.experiencias, ...(d.historico || []).map(item => item.cargo)].filter(Boolean).join(' '))
  const temLideranca = LIDER_KW.some(termo => texto.includes(termo))
  return temLideranca ? { score: 100, detalhe: 'Liderança identificada' } : { score: 0, detalhe: 'Sem liderança identificada' }
}
function calcD5(cfg: ConfigTriagem, d: DadosCandidato) {
  const config = configSeguro(cfg); const formacoes = (config.d5_formacoes || []).map(norm).filter(Boolean); const nivelMinimo = norm(config.d5_nivel_min || 'qualquer')
  if (!formacoes.length && nivelMinimo === 'qualquer') return { score: 100, detalhe: 'Formação não configurada — critério neutro' }
  const formacao = norm(d.formacao)
  if (!formacao) return { score: 0, detalhe: 'Formação não informada' }
  const areaAderente = !formacoes.length || formacoes.some(requisito => formacao.includes(requisito))
  const nivelCandidato = NIVEL_ORDER.find(nivel => formacao.includes(nivel)) || 'qualquer'
  const nivelAderente = (NIVEL_MAP[nivelCandidato] || 0) >= (NIVEL_MAP[nivelMinimo] || 0)
  if (!areaAderente && !nivelAderente) return { score: 0, detalhe: 'Formação fora do perfil' }
  if (!areaAderente || !nivelAderente) return { score: 45, detalhe: !areaAderente ? 'Área de formação divergente' : 'Nível abaixo do mínimo' }
  return { score: 100, detalhe: `Formação aderente: ${nivelCandidato}` }
}
function calcD8(cfg: ConfigTriagem, d: DadosCandidato) {
  const config = configSeguro(cfg)
  if (!config.d8_ativo && !config.d8_eliminatorio) return { score: 100, detalhe: 'Indústria não avaliada — critério neutro' }
  const texto = norm([d.empresa_atual, d.experiencias].filter(Boolean).join(' '))
  if (CARNE_KW.some(termo => texto.includes(termo))) return { score: 100, detalhe: 'Experiência em indústria de carne ✓' }
  if (ALIM_KW.some(termo => texto.includes(termo))) return { score: 60, detalhe: 'Experiência em alimentos (não carne)' }
  return { score: 0, detalhe: config.d8_eliminatorio ? 'Sem experiência em carne — eliminatório' : 'Sem experiência na indústria priorizada' }
}
function idiomaNA(idioma?: string): boolean { const texto = norm(idioma); return !texto || texto.includes('nao aplicavel') || texto.includes('nao exigido') }
function nivelIdioma(texto: string, idioma: string): number { const fonte = norm(texto); if (!fonte.includes(norm(idioma))) return 0; for (const [nome, nivel] of Object.entries(NIVEL_IDIOMA)) if (fonte.includes(nome)) return nivel; return 1 }
function calcD9(cfg: ConfigTriagem, d: DadosCandidato) {
  const config = configSeguro(cfg)
  if (idiomaNA(config.d9_idioma1) && idiomaNA(config.d9_idioma2)) return { score: 100, detalhe: 'Idiomas não avaliados — critério neutro' }
  const idioma1 = config.d9_idioma1 || 'ingles'; const nivel1 = NIVEL_IDIOMA[norm(config.d9_nivel1 || 'avancado')] || 3
  const idioma2 = config.d9_idioma2 || ''; const nivel2 = NIVEL_IDIOMA[norm(config.d9_nivel2 || 'intermediario')] || 2
  const nota1 = idiomaNA(idioma1) ? 100 : Math.min(100, Math.round((nivelIdioma(d.idiomas || '', idioma1) / nivel1) * 100))
  const nota2 = idiomaNA(idioma2) ? 100 : Math.min(100, Math.round((nivelIdioma(d.idiomas || '', idioma2) / nivel2) * 100))
  return { score: Math.round(nota1 * 0.6 + nota2 * 0.4), detalhe: `${idioma1}: ${nota1}%${idioma2 ? ` · ${idioma2}: ${nota2}%` : ''}` }
}
function calcD10(cfg: ConfigTriagem, d: DadosCandidato) {
  const cidades = (configSeguro(cfg).d10_cidades || []).map(norm).filter(Boolean)
  if (!cidades.length) return { score: 100, detalhe: 'Localização não restringida — critério neutro' }
  const cidade = norm(d.cidade)
  if (!cidade) return { score: 35, detalhe: 'Localização não informada' }
  return cidades.some(aceita => cidade.includes(aceita) || aceita.includes(cidade)) ? { score: 100, detalhe: `Cidade aderente: ${d.cidade}` } : { score: 0, detalhe: `Fora da região: ${d.cidade}` }
}
function parseSalario(valor?: string): number | null { if (!valor) return null; let numero = String(valor).replace(/[^0-9,.-]/g, ''); if (numero.includes(',') && numero.includes('.')) numero = numero.replace(/\./g, '').replace(',', '.'); else numero = numero.replace(',', '.'); const resultado = Number(numero); return Number.isFinite(resultado) && resultado > 0 ? resultado : null }

export function calcularScore(cfg: ConfigTriagem, d: DadosCandidato): ResultadoScore {
  const config = configSeguro(cfg); const cargo = avaliarCargo(cfg, d); const conhecimentos = avaliarConhecimentos(cfg, d)
  const r1 = calcD1(cfg, d); const r2 = calcD2(cfg, d); const r3 = calcD3(cfg, d, cargo); const r4 = calcD4(cfg, d); const r5 = calcD5(cfg, d); const r8 = calcD8(cfg, d); const r9 = calcD9(cfg, d); const r10 = calcD10(cfg, d)
  const base = { score_d1:r1.score, score_d2:r2.score, score_d3:r3.score, score_d4:r4.score, score_d5:r5.score, score_d8:r8.score, score_d9:r9.score, score_d10:r10.score }
  const detalhes = { d1:r1.detalhe, d2:r2.detalhe, d3:r3.detalhe, d4:r4.detalhe, d5:r5.detalhe, d8:r8.detalhe, d9:r9.detalhe, d10:r10.detalhe, gate_cargo:cargo.detalhes, gate_conhecimentos:conhecimentos.detalhes }
  const semCriterio = !norm(cfg.cargo_buscado) && !norm(cfg.descritivo) && conhecimentos.total === 0
  const motivo = semCriterio ? 'Triagem bloqueada: importe ou configure a vaga antes de avaliar candidatos.' : cargo.ativo && !cargo.atende ? `Cargo/família incompatível: ${cargo.detalhes}` : conhecimentos.total > 0 && !conhecimentos.atende ? `Requisitos essenciais não comprovados: ${conhecimentos.faltantes.join(', ')}` : config.d8_eliminatorio && r8.score === 0 ? 'Critério eliminatório: indústria de carne' : ''
  if (motivo) return { ...base, score_total:0, classificacao:'reprovado', destaque:false, detalhes:{ ...detalhes, eliminado:motivo } }
  const p = cfg.pesos; const totalPesos = Object.values(p).reduce((total, valor) => total + valor, 0) || 100
  let scoreTotal = Math.round((r1.score*p.d1 + r2.score*p.d2 + r3.score*p.d3 + r4.score*p.d4 + r5.score*p.d5 + r8.score*p.d8 + r9.score*p.d9 + r10.score*p.d10) / totalPesos)
  let salarioDetalhe = 'Pretensão não informada — sem impacto'; const salario = parseSalario(d.salario_pret)
  if ((config.salario_min || config.salario_max) && salario) { const minimo = config.salario_min || 0; const maximo = config.salario_max || Infinity; if (salario >= minimo && salario <= maximo) { scoreTotal = Math.min(100, scoreTotal + 3); salarioDetalhe = 'Dentro da faixa — bônus +3' } else if (maximo !== Infinity && salario > maximo * 1.15) { scoreTotal = Math.max(0, scoreTotal - 3); salarioDetalhe = 'Acima da faixa — ajuste -3' } else if (salario < minimo) { scoreTotal = Math.min(100, scoreTotal + 1); salarioDetalhe = 'Abaixo da faixa — bônus +1' } }
  const classificacao = scoreTotal >= cfg.limiar_aprovado ? 'aprovado' : scoreTotal >= cfg.limiar_potencial ? 'potencial' : 'reprovado'
  return { ...base, score_total:scoreTotal, classificacao, destaque:classificacao === 'aprovado' && scoreTotal >= 80, detalhes:{ ...detalhes, salario:salarioDetalhe } }
}
