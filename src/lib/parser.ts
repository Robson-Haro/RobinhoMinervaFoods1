import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { type DadosCandidato } from './engine'

export type ParseResult = {
  colunas: string[]
  rows: Record<string, string>[]
  total: number
}

export async function parseArquivo(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: 'UTF-8',
        complete: (r) => {
          const rows = r.data as Record<string, string>[]
          const colunas = r.meta.fields || []
          resolve({ colunas, rows, total: rows.length })
        },
        error: reject,
      })
    })
  }

  // Excel
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
  const colunas = rows.length > 0 ? Object.keys(rows[0]) : []
  return { colunas, rows, total: rows.length }
}

// Mapear linha bruta para DadosCandidato usando mapeamento de colunas
export function mapearCandidato(
  row: Record<string, string>,
  mapeamento: Record<string, string>
): DadosCandidato {
  const get = (key: string) => (mapeamento[key] ? (row[mapeamento[key]] || '').trim() : '')
  return {
    nome:         get('nome'),
    telefone:     formatTel(get('tel')),
    email:        get('email'),
    linkedin_url: get('linkedin'),
    cidade:       get('cidade'),
    estado:       get('estado'),
    cargo_atual:  get('cargo'),
    empresa_atual:get('empresa'),
    experiencias: get('exp'),
    formacao:     get('form'),
    idiomas:      get('idiomas'),
    salario_pret: get('salario'),
    dados_brutos: row,
  }
}

// Formatar telefone: garantir vírgula-espaço na exibição
export function formatTel(tel: string): string {
  if (!tel) return ''
  const d = tel.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return tel
}

// Autodetectar mapeamento de colunas por nome
const AUTO_RULES: Record<string, string[]> = {
  nome:    ['nome','name','candidato','candidate','nombre'],
  tel:     ['telefone','phone','celular','whatsapp','tel','fone','movil'],
  email:   ['email','e-mail','mail','correo'],
  linkedin:['linkedin','perfil','profile'],
  cargo:   ['cargo','posicao','position','job','titulo','title','puesto'],
  empresa: ['empresa','company','organizacao','org','empregador'],
  cidade:  ['cidade','city','localizacao','location','ciudad'],
  estado:  ['estado','state','uf','provincia'],
  exp:     ['experiencia','experiencias','experience','historico','historial','background'],
  form:    ['formacao','formacoes','education','academico','formacion','escolaridade'],
  idiomas: ['idioma','idiomas','language','languages','lengua'],
  salario: ['salario','pretensao','salary','remuneracao','pretension','sueldo'],
}

export function autoMapear(colunas: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [campo, aliases] of Object.entries(AUTO_RULES)) {
    const match = colunas.find(col =>
      aliases.some(a => col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(a))
    )
    if (match) map[campo] = match
  }
  return map
}

// Exportar CSV com vírgula + espaço
export function exportarCSV(candidatos: Record<string, unknown>[], filename: string) {
  const cols = ['rank','nome','score_total','classificacao','destaque','cargo_atual','cidade','telefone','email','linkedin_url']
  const header = cols.join(', ')
  const rows = candidatos.map((c, i) =>
    cols.map(k => {
      const v = k === 'rank' ? i + 1 : (c[k] ?? '')
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
    }).join(', ')
  )
  const csv = [header, ...rows].join('\n')
  const a = document.createElement('a')
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
  a.download = filename
  a.click()
}
