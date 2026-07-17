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

    // Buscar vaga específica por ID — busca EXATA com validação
    if (action === 'jobinfo') {
      const jobId = String(req.query.jobId || '').trim()
      if (!jobId) return res.status(400).json({ error: 'jobId obrigatório' })
      const bate = (j) => j && (String(j.id) === jobId || String(j.code || '').endsWith('-' + jobId))

      // Tentativa 1: v2 com filtro ids (validando o resultado)
      let r = await fetch(`https://api.gupy.io/api/v2/jobs?ids=${jobId}`, { headers })
      if (r.ok) {
        const d = await r.json()
        const job = (d.results || d.data || []).find(bate)
        if (job) return res.status(200).json({ job })
      }

      // Tentativa 2: caminho direto v1 /jobs/{id}
      r = await fetch(`${base}/jobs/${jobId}`, { headers })
      if (r.ok) {
        const d = await r.json()
        const job = d.data || d
        if (bate(job)) return res.status(200).json({ job })
      }

      // Tentativa 3: varrer a lista completa página por página (até 10 páginas de 100)
      for (let page = 1; page <= 10; page++) {
        r = await fetch(`${base}/jobs?perPage=100&page=${page}`, { headers })
        if (!r.ok) break
        const d = await r.json()
        const lista = d.results || d.data || []
        const job = lista.find(bate)
        if (job) return res.status(200).json({ job })
        if (lista.length < 100) break
      }

      return res.status(404).json({ error: `Vaga ${jobId} não encontrada na conta Gupy. Confira o número — pode ser de outra unidade/conta, vaga muito antiga ou o número do anúncio público (diferente do ID interno).` })
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
