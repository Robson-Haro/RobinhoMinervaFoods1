import { supabase, type Processo, type Candidato, type Triagem } from './supabase'
import { type ConfigTriagem, type DadosCandidato, calcularScore } from './engine'

// ── Processos ───────────────────────────────────────────────
export async function salvarProcesso(p: Partial<Processo>): Promise<Processo | null> {
  const { data, error } = await supabase
    .from('processos')
    .upsert({ ...p, updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) { console.error('[DB] salvarProcesso:', error); return null }
  return data
}

export async function listarProcessos(): Promise<Processo[]> {
  const { data } = await supabase
    .from('processos')
    .select('*')
    .order('created_at', { ascending: false })
  return data || []
}

export async function buscarProcesso(id: string): Promise<Processo | null> {
  const { data } = await supabase
    .from('processos')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

// ── Triagens ────────────────────────────────────────────────
export async function criarTriagem(processoId: string, nome: string, mapeamento: Record<string, string>): Promise<Triagem | null> {
  const { data, error } = await supabase
    .from('triagens')
    .insert({ processo_id: processoId, nome, mapeamento })
    .select()
    .single()
  if (error) { console.error('[DB] criarTriagem:', error); return null }
  return data
}

export async function listarTriagens(processoId: string): Promise<Triagem[]> {
  const { data } = await supabase
    .from('triagens')
    .select('*')
    .eq('processo_id', processoId)
    .order('created_at', { ascending: false })
  return data || []
}

// ── Candidatos ──────────────────────────────────────────────
export async function salvarCandidatos(
  triagemId: string,
  processoId: string,
  rows: DadosCandidato[],
  cfg: ConfigTriagem,
  onProgress?: (done: number, total: number) => void
): Promise<Candidato[]> {
  const resultados: Candidato[] = []
  const BATCH = 50

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const records = batch.map(d => {
      const r = calcularScore(cfg, d)
      return {
        triagem_id: triagemId,
        processo_id: processoId,
        nome: d.nome,
        telefone: d.telefone,
        email: d.email,
        linkedin_url: d.linkedin_url,
        cidade: d.cidade,
        estado: d.estado,
        cargo_atual: d.cargo_atual,
        empresa_atual: d.empresa_atual,
        experiencias: d.experiencias,
        formacao: d.formacao,
        idiomas: d.idiomas,
        salario_pret: d.salario_pret ? parseFloat(d.salario_pret.replace(/\D/g, '')) || null : null,
        ...r,
        dados_brutos: d.dados_brutos,
      }
    })

    const { data, error } = await supabase
      .from('candidatos')
      .insert(records)
      .select()

    if (!error && data) resultados.push(...data)
    if (onProgress) onProgress(Math.min(i + BATCH, rows.length), rows.length)
  }

  // Atualizar totais na triagem
  const ap = resultados.filter(c => c.classificacao === 'aprovado').length
  const pot = resultados.filter(c => c.classificacao === 'potencial').length
  const rep = resultados.filter(c => c.classificacao === 'reprovado').length
  const avg = resultados.length ? resultados.reduce((s, c) => s + c.score_total, 0) / resultados.length : 0

  await supabase.from('triagens').update({
    total: resultados.length,
    aprovados: ap,
    potenciais: pot,
    reprovados: rep,
    score_medio: Math.round(avg * 100) / 100,
  }).eq('id', triagemId)

  return resultados
}

export async function listarCandidatos(
  triagemId: string,
  filtro?: 'aprovado' | 'potencial' | 'reprovado'
): Promise<Candidato[]> {
  let q = supabase
    .from('candidatos')
    .select('*')
    .eq('triagem_id', triagemId)
    .order('score_total', { ascending: false })

  if (filtro) q = q.eq('classificacao', filtro)

  const { data } = await q
  return data || []
}

export async function marcarWppEnviado(candidatoId: string): Promise<void> {
  await supabase
    .from('candidatos')
    .update({ wpp_enviado: true, wpp_enviado_at: new Date().toISOString() })
    .eq('id', candidatoId)
}

// ── Config Global ───────────────────────────────────────────
export async function salvarConfig(chave: string, valor: unknown): Promise<void> {
  await supabase
    .from('configs_globais')
    .upsert({ chave, valor, updated_at: new Date().toISOString() })
}

export async function buscarConfig(chave: string): Promise<unknown> {
  const { data } = await supabase
    .from('configs_globais')
    .select('valor')
    .eq('chave', chave)
    .single()
  return data?.valor
}
