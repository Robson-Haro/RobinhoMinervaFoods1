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

  // Enriquecer vaga com a descrição completa (detalhe v1 → página pública de carreiras)
  async function enriquecer(job) {
    if (!job || job.description) return job
    // Tentativa 1: endpoint de detalhe v1
    try {
      const r = await fetch(`${base}/jobs/${job.id}`, { headers })
      if (r.ok) {
        const d = await r.json()
        const full = d.data || d
        if (full && (full.description || full.responsibilities)) return { ...job, ...full }
      }
    } catch {}
    // Tentativa 2: página pública de carreiras da Minerva (vagas publicadas externas)
    try {
      const rp = await fetch(`https://minervafoods.gupy.io/jobs/${job.id}`, { redirect: 'follow' })
      if (rp.ok) {
        const html = await rp.text()
        const un = (s) => { try { return s ? JSON.parse('"' + s + '"').trim() : '' } catch { return '' } }
        const pega = (campo) => {
          const m = html.match(new RegExp('"' + campo + '":"((?:[^"\\\\]|\\\\.)*)"'))
          return m ? un(m[1]) : ''
        }
        const description = pega('description')
        const responsibilities = pega('responsibilities')
        const prerequisites = pega('prerequisites')
        const additionalInformation = pega('additionalInformation')
        if (description || responsibilities || prerequisites) {
          return { ...job, description, responsibilities, prerequisites, additionalInformation, fonteDescricao: 'pagina publica de carreiras' }
        }
      }
    } catch {}
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
        `${base}/jobs/${jobId}`,
        `${base}/jobs?code=77785-${jobId}`,
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
          const rp = await fetch(`${base}/jobs?perPage=100&page=${page}&status=published`, { headers })
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
        let r = await fetch(`${base}/jobs?perPage=100&page=1`, { headers })
        if (r.ok) {
          const d = await r.json()
          const total = d.totalCount || d.total || (d.pagination && (d.pagination.total || d.pagination.totalCount)) || 0
          const ultimaPagina = total ? Math.ceil(total / 100) : 10
          // varrer as últimas 8 páginas (mais recentes) e as primeiras 2
          const paginas = []
          for (let p = ultimaPagina; p > ultimaPagina - 8 && p >= 1; p--) paginas.push(p)
          if (!paginas.includes(1)) paginas.push(1)
          for (const page of paginas) {
            const rp = await fetch(`${base}/jobs?perPage=100&page=${page}`, { headers })
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
      const r = await fetch(`${base}/jobs/${jobId}/applications?perPage=100`, { headers })
      const data = await r.json()
      return res.status(r.status).json(data)
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
        body: JSON.stringify({ currentStepId: Number(stepId), status: 'in_process' }),
      })
      const data = await r.json()
      return res.status(r.status).json(data)
    }

    return res.status(400).json({ error: 'Ação inválida. Use: jobs, steps, applications, move' })
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao comunicar com a Gupy: ' + String(e) })
  }
}
