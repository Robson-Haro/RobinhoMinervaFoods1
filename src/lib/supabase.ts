import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL  as string
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  console.warn('[Robinho] Supabase não configurado. Operando em modo offline.')
}

export const supabase = createClient(url || '', key || '')

// ── Tipos utilitários ───────────────────────────────────────
export type Processo = {
  id: string
  nome: string
  responsavel: string
  cargo_buscado: string
  descritivo: string
  sensibilidade: 'strict' | 'normal' | 'flex'
  limiar_aprovado: number
  limiar_potencial: number
  pesos: Record<string, number>
  config: Record<string, unknown>
  status: 'ativo' | 'pausado' | 'encerrado'
  idioma: 'pt' | 'en' | 'es'
  created_at: string
}

export type Candidato = {
  id: string
  triagem_id: string
  processo_id: string
  nome: string
  telefone: string
  email: string
  linkedin_url: string
  cidade: string
  estado: string
  cargo_atual: string
  empresa_atual: string
  experiencias: string
  formacao: string
  idiomas: string
  salario_pret: number | null
  score_d1: number; score_d2: number; score_d3: number; score_d4: number
  score_d5: number; score_d8: number; score_d9: number; score_d10: number
  score_custom: Record<string, number>
  score_total: number
  classificacao: 'aprovado' | 'potencial' | 'reprovado' | 'pendente'
  destaque: boolean
  detalhes: Record<string, unknown>
  wpp_enviado: boolean
  dados_brutos: Record<string, unknown>
  created_at: string
}

export type Triagem = {
  id: string
  processo_id: string
  nome: string
  total: number
  aprovados: number
  potenciais: number
  reprovados: number
  score_medio: number
  mapeamento: Record<string, string>
  created_at: string
}
