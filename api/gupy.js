// ============================================================
// Proxy seguro para a API da Gupy — roda no servidor da Vercel
// O token NUNCA é exposto ao navegador.
// Configure GUPY_API_TOKEN nas Environment Variables da Vercel.
// ============================================================

export default async function handler(req, res) {
  const token = process.env.GUPY_API_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'GUPY_API_TOKEN não configurado na Vercel. Vá em Settings → Environment Variables.' })
  }

  const base = 'https://api.gupy.io/api/v1'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const action = req.query.action

  try {
    // Listar vagas
    if (action === 'jobs') {
      const r = await fetch(`${base}/jobs?perPage=100&status=published`, { headers })
      const data = await r.json()
      return res.status(r.status).json(data)
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
