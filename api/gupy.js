// ============================================================
// Proxy seguro para a API da Gupy — roda no servidor da Vercel
// O token NUNCA é exposto ao navegador.
// Configure GUPY_API_TOKEN nas Environment Variables da Vercel.
// ============================================================

export default async function handler(req, res) {
  const token = process.env.GUPY_API_TOKEN
  if (!token) {
    return res.status(500).json({
      error: 'GUPY_API_TOKEN não configurado na Vercel. Vá em Settings → Environment Variables.',
      diagnostico: {
        tokenConfigurado: false,
        ambiente: process.env.VERCEL_ENV || 'desconhecido',
        projetoVercel: process.env.VERCEL_PROJECT_PRODUCTION_URL || 'desconhecido',
        dica: 'A variável deve estar no MESMO projeto Vercel deste link, marcada para Production, e é preciso fazer Redeploy após salvar.'
      }
    })
  }

  const base = 'https://api.gupy.io/api/v1'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const action = req.query.action

  // Enriquecer vaga com a descrição completa (detalhe v1 → descoberta de páginas de carreiras → páginas públicas)
  async function enriquecer(job) {
    if (!job || (job.description && String(job.description).length > 20)) return job

    const un = (s) => { try { return s ? JSON.parse('"' + s + '"').trim() : '' } catch { return '' } }
    const pega = (html, campo) => {
      const m = html.match(new RegExp('"' + campo + '":"((?:[^"\\\\]|\\\\.)*)"'))
      return m ? un(m[1]) : ''
    }

    // Tentativa 1: endpoint de detalhe v1 com fields=all
    try {
      const r = await fetch(`${base}/jobs/${job.id}?fields=all`, { headers })
      if (r.ok) {
        const d = await r.json()
        const full = d.data || d
        if (full && (full.description || full.responsibilities)) return { ...job, ...full, fonteDescricao: 'API detalhe v1' }
      }
    } catch {}

    // Tentativa 2: descobrir TODAS as páginas de carreiras da empresa e priorizar a da vaga
    let sites = []
    try {
      let r = null
      for (const path of ['career-pages', 'careerpages', 'careerPages']) {
        r = await fetch(`${base}/${path}?fields=all&perPage=100`, { headers })
        if (r.ok) break
      }
      if (r && r.ok) {
        const d = await r.json()
        const paginas = d.results || d.data || []
        const urlDe = (p) => p.siteUrl || p.url || (p.subdomain ? `https://${p.subdomain}.gupy.io` : null)
        const propria = paginas.find(p => String(p.id) === String(job.careerPageId))
        if (propria && urlDe(propria)) sites.push(urlDe(propria))
        for (const p of paginas) { const u = urlDe(p); if (u && !sites.includes(u)) sites.push(u) }
      }
    } catch {}
    if (!sites.length) sites = ['https://minervafoods.gupy.io']
    sites = sites.slice(0, 5)

    // Tentativa 3: ler a descrição da página pública de cada site (a da vaga primeiro)
    for (const site of sites) {
      try {
        const rp = await fetch(`${String(site).replace(/\/$/, '')}/jobs/${job.id}`, { redirect: 'follow' })
        if (!rp.ok) continue
        const html = await rp.text()
        const description = pega(html, 'description')
        const responsibilities = pega(html, 'responsibilities')
        const prerequisites = pega(html, 'prerequisites')
        const additionalInformation = pega(html, 'additionalInformation')
        if (description || responsibilities || prerequisites) {
          return { ...job, description, responsibilities, prerequisites, additionalInformation, fonteDescricao: site }
        }
      } catch {}
    }

    return job
  }

  // Diagnóstico: confirma se a variável chegou ao servidor (sem revelar o valor)
  if (action === 'status') {
    return res.status(200).json({
      tokenConfigurado: true,
      tamanhoToken: token.length,
      inicioToken: token.slice(0, 4) + '...',
      ambiente: process.env.VERCEL_ENV || 'desconhecido',
      mensagem: '✅ Variável GUPY_API_TOKEN chegou ao servidor com sucesso'
    })
  }

  try {
    // Listar vagas
    if (action === 'jobs') {
      const r = await fetch(`${base}/jobs?perPage=100&status=published`, { headers })
      const data = await r.json()
      return res.status(r.status).json(data)
    }

    // RASTREADOR: diagnóstico completo da busca de descrição
    if (action === 'debugdesc') {
      const jobId = String(req.query.jobId || '').trim()
      const trace = []
      let job = null

      // localizar a vaga nas publicadas
      for (let page = 1; page <= 10 && !job; page++) {
        const r = await fetch(`${base}/jobs?perPage=100&page=${page}&status=published&fields=all`, { headers })
        trace.push({ passo: `listagem publicadas p${page}`, status: r.status })
        if (!r.ok) break
        const d = await r.json()
        const lista = d.results || d.data || []
        job = lista.find(j => String(j.id) === jobId) || null
        if (lista.length < 100) break
      }
      if (!job) return res.status(200).json({ trace, erro: 'vaga não localizada nas publicadas' })
      trace.push({ passo: 'vaga localizada', nome: job.name, careerPageId: job.careerPageId, publicationType: job.publicationType, temDescricaoNaListagem: !!job.description })

      // detalhe v1
      let r = await fetch(`${base}/jobs/${jobId}?fields=all`, { headers })
      trace.push({ passo: 'detalhe v1 /jobs/{id}', status: r.status })
      if (r.ok) { try { const d = await r.json(); const full = d.data || d; trace.push({ passo: 'detalhe v1 corpo', temDescricao: !!(full && full.description) }) } catch {} }

      // career pages (3 variações de caminho)
      let paginas = []
      for (const path of ['career-pages', 'careerpages', 'careerPages']) {
        r = await fetch(`${base}/${path}?fields=all&perPage=100`, { headers })
        trace.push({ passo: `career pages /${path}`, status: r.status })
        if (r.ok) { try { const d = await r.json(); paginas = d.results || d.data || []; break } catch {} }
      }
      const urlDe = (p) => p.siteUrl || p.url || (p.subdomain ? `https://${p.subdomain}.gupy.io` : null)
      trace.push({ passo: 'paginas descobertas', total: paginas.length, sites: paginas.slice(0, 10).map(p => ({ id: p.id, url: urlDe(p) })) })

      // testar página pública em cada site
      let sites = []
      const propria = paginas.find(p => String(p.id) === String(job.careerPageId))
      if (propria && urlDe(propria)) sites.push(urlDe(propria))
      for (const p of paginas) { const u = urlDe(p); if (u && !sites.includes(u)) sites.push(u) }
      if (!sites.length) sites = ['https://minervafoods.gupy.io']
      sites = sites.slice(0, 5)

      for (const site of sites) {
        try {
          const url = `${String(site).replace(/\/$/, '')}/jobs/${jobId}`
          const rp = await fetch(url, { redirect: 'follow' })
          const html = rp.ok ? await rp.text() : ''
          trace.push({
            passo: 'pagina publica', url, status: rp.status, tamanhoHtml: html.length,
            contemDescription: html.includes('"description"'),
            contemJsonLd: html.includes('application/ld+json'),
            trechoDescription: (html.match(/"description":"([^"]{0,80})/) || [])[1] || null
          })
        } catch (e) { trace.push({ passo: 'pagina publica', site, erro: String(e).slice(0, 100) }) }
      }

      return res.status(200).json({ trace })
    }

    // Buscar vaga específica por ID — busca EXATA multiestratégia
    if (action === 'jobinfo') {
      const jobId = String(req.query.jobId || '').trim()
      if (!jobId) return res.status(400).json({ error: 'jobId obrigatório' })
      const bate = (j) => j && (String(j.id) === jobId || String(j.code || '').endsWith('-' + jobId))
      const extrair = (d) => (d && (d.results || d.data || (Array.isArray(d) ? d : []))) || []

      // Estratégias diretas (rápidas)
      const tentativas = [
        `https://api.gupy.io/api/v2/jobs/${jobId}`,
        `https://api.gupy.io/api/v2/jobs?ids[]=${jobId}`,
        `https://api.gupy.io/api/v2/jobs?ids=${jobId}`,
        `${base}/jobs/${jobId}?fields=all`,
        `${base}/jobs?code=77785-${jobId}&fields=all`,
      ]
      for (const url of tentativas) {
        try {
          const r = await fetch(url, { headers })
          if (!r.ok) continue
          const d = await r.json()
          const candidatos = extrair(d)
          const job = candidatos.length ? candidatos.find(bate) : (bate(d.data || d) ? (d.data || d) : null)
          if (job) return res.status(200).json({ job: await enriquecer(job), estrategia: url.split('?')[0] })
        } catch {}
      }

      // PRIORIDADE: varrer apenas vagas PUBLICADAS (ativas) — rápido e certeiro
      try {
        for (let page = 1; page <= 10; page++) {
          const rp = await fetch(`${base}/jobs?perPage=100&page=${page}&status=published&fields=all`, { headers })
          if (!rp.ok) break
          const dp = await rp.json()
          const lista = extrair(dp)
          const job = lista.find(bate)
          if (job) return res.status(200).json({ job: await enriquecer(job), estrategia: `vagas publicadas pagina ${page}` })
          if (lista.length < 100) break
        }
      } catch {}

      // Varredura pelo FIM da lista (vagas mais recentes)
      try {
        let r = await fetch(`${base}/jobs?perPage=100&page=1&fields=all`, { headers })
        if (r.ok) {
          const d = await r.json()
          const total = d.totalCount || d.total || (d.pagination && (d.pagination.total || d.pagination.totalCount)) || 0
          const ultimaPagina = total ? Math.ceil(total / 100) : 10
          // varrer as últimas 8 páginas (mais recentes) e as primeiras 2
          const paginas = []
          for (let p = ultimaPagina; p > ultimaPagina - 8 && p >= 1; p--) paginas.push(p)
          if (!paginas.includes(1)) paginas.push(1)
          for (const page of paginas) {
            const rp = await fetch(`${base}/jobs?perPage=100&page=${page}&fields=all`, { headers })
            if (!rp.ok) continue
            const dp = await rp.json()
            const job = extrair(dp).find(bate)
            if (job) return res.status(200).json({ job: await enriquecer(job), estrategia: `varredura pagina ${page} de ${ultimaPagina}` })
          }
          return res.status(404).json({ error: `Vaga ${jobId} não encontrada entre ${total || 'as'} vagas da conta. Confirme o número no painel da Gupy (o ID que aparece na URL ao abrir a vaga).`, totalVagasNaConta: total })
        }
      } catch {}

      return res.status(404).json({ error: `Vaga ${jobId} não encontrada. Confirme o número no painel da Gupy.` })
    }

    // Listar etapas de uma vaga
    if (action === 'steps') {
      const jobId = req.query.jobId
      if (!jobId) return res.status(400).json({ error: 'jobId obrigatório' })
      const r = await fetch(`${base}/jobs/${jobId}/steps`, { headers })
      const data = await r.json()
      return res.status(r.status).json(data)
    }

    // Listar candidaturas de uma vaga
    if (action === 'applications') {
      const jobId = req.query.jobId
      if (!jobId) return res.status(400).json({ error: 'jobId obrigatório' })

      // O Robinho só pode triar quem ainda está na etapa inicial "Cadastro".
      // Resolver o ID pela própria vaga evita depender de um ID fixo, que muda
      // entre processos seletivos.
      const normalizar = (valor) => String(valor || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
      const stepsResponse = await fetch(`${base}/jobs/${jobId}/steps`, { headers })
      const stepsData = await stepsResponse.json()
      if (!stepsResponse.ok) return res.status(stepsResponse.status).json(stepsData)

      const steps = stepsData.results || stepsData.data || (Array.isArray(stepsData) ? stepsData : [])
      const cadastro = steps.find((step) => normalizar(step.name) === 'cadastro')
      if (!cadastro) {
        return res.status(422).json({
          error: 'A etapa "Cadastro" não foi encontrada nesta vaga. Nenhum candidato foi triado por segurança.',
        })
      }

      // Paginar toda a vaga antes de filtrar. Assim candidatos em Cadastro não
      // ficam de fora quando a vaga possui mais de 100 inscrições.
      const applications = []
      for (let page = 1; page <= 100; page++) {
        const r = await fetch(`${base}/jobs/${jobId}/applications?perPage=100&page=${page}`, { headers })
        const data = await r.json()
        if (!r.ok) return res.status(r.status).json(data)
        const pageItems = data.results || data.data || (Array.isArray(data) ? data : [])
        applications.push(...pageItems)
        if (pageItems.length < 100) break
      }

      const cadastroId = String(cadastro.id)
      const somenteCadastro = applications.filter((application) => {
        const currentStep = application.currentStep || {}
        const currentStepId = application.currentStepId ?? application.stepId ?? currentStep.id
        const currentStepName = application.currentStepName ?? currentStep.name
        return String(currentStepId || '') === cadastroId || normalizar(currentStepName) === 'cadastro'
      })

      // A listagem v1 de candidaturas traz principalmente dados de contato. O
      // motor precisa do perfil profissional completo para comparar a pessoa à
      // vaga. Buscar os candidatos em lote na API v2 evita que experiência,
      // formação, idiomas e localização sejam enviados vazios ao score.
      const candidateIds = [...new Set(somenteCadastro.map((application) => {
        const candidate = application.candidate || application.manualCandidate || {}
        return application.candidateId ?? candidate.id
      }).filter(Boolean).map(String))]
      const profilesById = new Map()
      for (let offset = 0; offset < candidateIds.length; offset += 50) {
        const ids = candidateIds.slice(offset, offset + 50)
        try {
          const url = `https://api.gupy.io/api/v2/candidates?ids=${encodeURIComponent(ids.join(','))}&maxPageSize=50`
          const profileResponse = await fetch(url, { headers })
          if (!profileResponse.ok) continue
          const profileData = await profileResponse.json()
          const profiles = profileData.results || profileData.data || (Array.isArray(profileData) ? profileData : [])
          for (const profile of profiles) profilesById.set(String(profile.id), profile)
        } catch {}
      }

      const enriched = somenteCadastro.map((application) => {
        const candidate = application.candidate || application.manualCandidate || {}
        const candidateId = application.candidateId ?? candidate.id
        const candidateProfile = profilesById.get(String(candidateId || '')) || null
        return { ...application, candidateProfile }
      })

      return res.status(200).json({
        results: enriched,
        totalCount: enriched.length,
        sourceTotalCount: applications.length,
        enrichedProfiles: profilesById.size,
        filteredByStep: { id: cadastro.id, name: cadastro.name },
      })
    }

    // Mover candidatura para outra etapa (somente aprovação, nunca reprovação)
    if (action === 'move' && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const { jobId, applicationId, stepId } = body || {}
      if (!jobId || !applicationId || !stepId) {
        return res.status(400).json({ error: 'jobId, applicationId e stepId são obrigatórios' })
      }
      const r = await fetch(`${base}/jobs/${jobId}/applications/${applicationId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ currentStepId: Number(stepId) }),
      })
      const data = await r.json()
      return res.status(r.status).json(data)
    }

    return res.status(400).json({ error: 'Ação inválida. Use: jobs, steps, applications, move' })
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao comunicar com a Gupy: ' + String(e) })
  }
}
