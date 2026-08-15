import { type DadosCandidato } from './engine'

type AnyRecord = Record<string, any>

function text(parts: unknown[]): string {
  return parts.filter(v => v !== null && v !== undefined && String(v).trim()).map(String).join(' · ')
}

function currentExperience(experiences: AnyRecord[]): AnyRecord {
  return [...experiences].sort((a, b) => {
    const aCurrent = a.endYear == null ? 1 : 0
    const bCurrent = b.endYear == null ? 1 : 0
    return bCurrent - aCurrent || Number(b.startYear || 0) - Number(a.startYear || 0)
  })[0] || {}
}

export function mapearPerfilGupy(application: AnyRecord): DadosCandidato {
  const basic = application.candidate || application.manualCandidate || {}
  const profile = application.candidateProfile || basic
  const experiences = Array.isArray(profile.experiences) ? profile.experiences : []
  const education = Array.isArray(profile.education) ? profile.education : []
  const languages = Array.isArray(profile.languages) ? profile.languages : []
  const addresses = Array.isArray(profile.addresses) ? profile.addresses : []
  const current = currentExperience(experiences)
  const address = addresses[0] || {}
  const firstName = profile.firstName || basic.name || basic.firstName || ''
  const lastName = profile.lastName || basic.lastName || ''

  return {
    nome: `${firstName} ${lastName}`.trim(),
    telefone: profile.phoneNumbers?.[0] || basic.mobileNumber || basic.phoneNumber || '',
    email: profile.emailAddresses?.[0] || basic.email || '',
    linkedin_url: profile.linkedinProfileUrl || basic.linkedinProfileUrl || '',
    cidade: address.city || basic.city || '',
    estado: address.stateCode || basic.state || '',
    cargo_atual: current.role || basic.currentRole || basic.position || '',
    empresa_atual: current.organization || basic.currentCompany || '',
    experiencias: experiences.map((e: AnyRecord) => text([
      e.role, e.organization, e.activitiesPerformed,
      e.startYear && `início ${e.startMonth || ''}/${e.startYear}`,
      e.endYear ? `fim ${e.endMonth || ''}/${e.endYear}` : 'atual',
    ])).join(' | '),
    formacao: education.map((e: AnyRecord) => text([e.degree, e.course, e.institution, e.status])).join(' | '),
    idiomas: languages.map((l: AnyRecord) => text([l.name, l.level])).join(' | '),
    salario_pret: application.salaryExpectation || application.salary || '',
    dados_brutos: application,
  }
}
