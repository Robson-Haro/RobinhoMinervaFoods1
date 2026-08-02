import React, { useState } from 'react'
import App from './App'
import './portal.css'

type SystemCard = {
  name: string
  eyebrow: string
  description: string
  href?: string
  icon: string
  tone: 'red' | 'blue' | 'beige'
  internal?: boolean
}

const systems: SystemCard[] = [
  {
    name: 'Roadmap da Vaga',
    eyebrow: 'Planejamento',
    description: 'Transforme o Time to Fill em um plano visual, automático e pronto para compartilhar.',
    href: 'https://cronograma-de-vagas.vercel.app/',
    icon: '◫',
    tone: 'red',
  },
  {
    name: 'Kairós',
    eyebrow: 'Inteligência de talentos',
    description: 'Cruze candidatos, vagas e requisitos para ampliar o aproveitamento interno.',
    href: 'https://minerva-foods-kairos.vercel.app/',
    icon: '✦',
    tone: 'beige',
  },
  {
    name: 'Robinho',
    eyebrow: 'Gestão de seleção',
    description: 'Centralize parâmetros, triagens, resultados e integrações do processo seletivo.',
    icon: 'R',
    tone: 'blue',
    internal: true,
  },
  {
    name: 'Eureka',
    eyebrow: 'Busca estratégica',
    description: 'Localize e organize perfis públicos do LinkedIn para acelerar o hunting de talentos.',
    href: 'https://olho-de-guia.vercel.app/',
    icon: 'E',
    tone: 'blue',
  },
  {
    name: 'Hakol Hunter',
    eyebrow: 'Agente de hunting',
    description: 'Acelere a busca ativa de profissionais com apoio de um agente especializado.',
    href: 'https://maia.minervafoods.com/c/new?agent_id=agent_sXlRSZueB9PGxl-69l8wV',
    icon: '⌁',
    tone: 'red',
  },
]

export default function Portal() {
  const [enteredRobinho, setEnteredRobinho] = useState(false)

  if (enteredRobinho) {
    return (
      <div className="robinho-shell">
        <button className="portal-return" onClick={() => setEnteredRobinho(false)} aria-label="Voltar para o Ecossistema de Talent Acquisition Estratégico">
          <span className="home-icon">⌂</span> HOME
        </button>
        <App />
      </div>
    )
  }

  const openSystem = (system: SystemCard) => {
    if (system.internal) {
      setEnteredRobinho(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (system.href) window.open(system.href, '_blank', 'noopener,noreferrer')
  }

  return (
    <main className="talent-portal">
      <div className="portal-orb orb-red" />
      <div className="portal-orb orb-blue" />
      <div className="portal-orb orb-beige" />

      <header className="portal-header">
        <img src="https://cronograma-de-vagas.vercel.app/minerva-logo.svg" alt="Minerva Foods" className="portal-logo" />
        <div className="portal-status"><span /> Ecossistema ativo</div>
      </header>

      <section className="portal-hero">
        <div className="hero-copy">
          <span className="portal-kicker">TALENT ACQUISITION · DIGITAL ECOSYSTEM</span>
          <h1 style={{ fontSize: 'clamp(43px, 6vw, 88px)', letterSpacing: '-4px' }}>
            Ecossistema de<br /><strong>Talent Acquisition<br />Estratégico</strong>
          </h1>
          <p>
            Uma experiência única para planejar, encontrar, avaliar e movimentar talentos.
            Escolha o sistema que apoiará sua próxima decisão.
          </p>
        </div>

        <div className="hero-dashboard glass-metal">
          <div><span>Sistemas integrados</span><strong>05</strong></div>
          <div><span>Jornada</span><strong>End-to-end</strong></div>
          <div><span>Experiência</span><strong>Talent Tech</strong></div>
        </div>
      </section>

      <section className="systems-section">
        <div className="section-heading">
          <div>
            <span>SELECIONE UMA SOLUÇÃO</span>
            <h2>Seu ecossistema de talentos</h2>
          </div>
          <p>Os sistemas externos abrem em uma nova aba, mantendo este portal disponível para retorno.</p>
        </div>

        <div className="systems-grid">
          {systems.map((system, index) => (
            <button
              key={system.name}
              className={`system-card system-${system.tone} ${index === 2 ? 'system-featured' : ''}`}
              onClick={() => openSystem(system)}
              aria-label={`Abrir ${system.name}`}
            >
              <div className="card-metal-shine" />
              <div className="card-top">
                <span className="system-icon">{system.icon}</span>
                <span className="system-number">{String(index + 1).padStart(2, '0')}</span>
              </div>
              <div className="card-content">
                <span className="card-eyebrow">{system.eyebrow}</span>
                <h3>{system.name}</h3>
                <p>{system.description}</p>
              </div>
              <div className="card-action">
                <span>Acessar sistema</span>
                <strong>→</strong>
              </div>
            </button>
          ))}
        </div>
      </section>

      <footer className="portal-footer">
        <span>Minerva Foods · Talent Acquisition</span>
        <span>Conectando pessoas, dados e decisões.</span>
      </footer>
    </main>
  )
}
