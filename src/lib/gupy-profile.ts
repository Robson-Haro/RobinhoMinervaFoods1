import { type DadosCandidato, type ExperienciaProfissional } from './engine'

type AnyRecord = Record<string, any>

function asArray(value: unknown): AnyRecord[] {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as AnyRecord[]
  return value && typeof value === 'object' ? [value as AnyRecord] : []
}

function text(parts: unknown[]): string {
  return parts.filter(value => value !== null && value !== undefined && String(value).trim()).map(String).join(' · ')
}

function firstText(value: unknown): string {
  if (Array.isArray(value)) return firstText(value[0])
  if (value && typeof value === 'object') return String((value as AnyRecord).number || (value as AnyRecord).value || (value as AnyRecord).name || '')
  return String(value || '')
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function dateParts(value: unknown): { year?: number; month?: number } {
  const match = String(value || '').match(/(\d{4})(?:[-/](\d{1,2}))?/)
  return { year: numberOrUndefined(match?.[1]), month: numberOrUndefined(match?.[2]) }
}

function mapExperience(experience: AnyRecord): ExperienciaProfissional {
  const start = dateParts(experience.startDate || experience.startedAt)
  const end = dateParts(experience.endDate || experience.endedAt)
  const atual = Boolean(experience.current || experience.isCurrent || experience.currentJob || (!experience.endYear && !experience.endDate && !experience.endedAt))
  return {
    cargo: experience.role || experience.position || experience.title || experience.jobTitle || '',
    empresa: experience.organization || experience.company || experience.organizationName || '',
    atividades: experience.activitiesPerformed || experience.responsibilities || experience.activities || experience.description || experience.summary || '',
    inicioAno: numberOrUndefined(experience.startYear) || start.year,
    inicioMes: numberOrUndefined(experience.startMonth) || start.month,
    fimAno: numberOrUndefined(experience.endYear) || end.year,
    fimMes: numberOrUndefined(experience.endMonth) || end.month,
    atual,
  }
}

function currentExperience(experiences: ExperienciaProfissional[]): ExperienciaProfissional {
  return [...experiences].sort((a, b) => {
    const aCurrent = a.atual ? 1 : 0
    const bCurrent = b.atual ? 1 : 0
    return bCurrent - aCurrent || Number(b.inicioAno || 0) - Number(a.inicioAno || 0)
  })[0] || {}
}

/** Converte o perfil v2 da Gupy em dados de triagem sem descartar variantes de campo. */
export function mapearPerfilGupy(application: AnyRecord): DadosCandidato {
  const basic = application.candidate || application.manualCandidate || {}
  const profile = application.candidateProfile || basic
  // A API v2 da Gupy usa `experience` (singular); algumas respostas antigas usam `experiences`.
  const rawExperiences = [...asArray(profile.experience), ...asArray(profile.experiences)]
  const historico = rawExperiences.map(mapExperience)
  const education = [...asArray(profile.education), ...asArray(profile.educations)]
  const languages = asArray(profile.languages)
  const addresses = [...asArray(profile.addresses), ...asArray(profile.address)]
  const current = currentExperience(historico)
  const address = addresses[0] || {}
  const firstName = profile.firstName || basic.name || basic.firstName || profile.name || ''
  const lastName = profile.lastName || basic.lastName || ''

  return {
    nome: `${firstName} ${lastName}`.trim(),
    telefone: firstText(profile.phoneNumbers || profile.phoneNumber || basic.mobileNumber || basic.phoneNumber),
    email: firstText(profile.emailAddresses || profile.emailAddress || basic.email),
    linkedin_url: profile.linkedinProfileUrl || profile.linkedinUrl || basic.linkedinProfileUrl || '',
    cidade: address.city || address.cityName || basic.city || '',
    estado: address.stateCode || address.state || basic.state || '',
    cargo_atual: current.cargo || basic.currentRole || basic.position || '',
    empresa_atual: current.empresa || basic.currentCompany || '',
    experiencias: historico.map(item => text([
      item.cargo, item.empresa, item.atividades,
      item.inicioAno && `início ${item.inicioMes || ''}/${item.inicioAno}`,
      item.atual ? 'atual' : item.fimAno && `fim ${item.fimMes || ''}/${item.fimAno}`,
    ])).join(' | '),
    formacao: education.map(item => text([item.degree, item.course, item.institution, item.status])).join(' | '),
    idiomas: languages.map(item => text([item.name || item.language, item.level || item.proficiency])).join(' | '),
    salario_pret: application.salaryExpectation || application.salary || '',
    historico,
    dados_brutos: application,
  }
}
