import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { LANGS } from './i18n'
import { parseArquivo, autoMapear, mapearCandidato, exportarCSV } from './lib/parser'
import { calcularScore, type ConfigTriagem, type DadosCandidato } from './lib/engine'
import { salvarProcesso, criarTriagem, salvarCandidatos, listarCandidatos } from './lib/db'
import { type Candidato } from './lib/supabase'

type Nav = 'dashboard' | 'params' | 'triagem' | 'results' | 'whatsapp' | 'config'
type Classificacao = 'aprovado' | 'potencial' | 'reprovado' | 'pendente'
const PESOS_PADRAO = { d1:20, d2:10, d3:15, d4:10, d5:10, d8:15, d9:10, d10:10 }
const BADGE_COLORS: Record<string, string> = { aprovado:'46,204,113', potencial:'201,168,76', reprovado:'231,76,60', pendente:'136,135,128' }

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:`rgba(${color},0.14)`, color:`rgb(${color})`, border:`0.5px solid rgba(${color},0.3)` }}>{children}</span>
}
function ScoreBar({ value, color }: { value: number; color: string }) {
  return <div style={{ display:'flex', alignItems:'center', gap:6 }}><div style={{ width:60, height:5, borderRadius:3, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}><div style={{ width:`${value}%`, height:'100%', background:`rgb(${color})`, borderRadius:3 }} /></div><span style={{ fontSize:13, fontWeight:600, color:`rgb(${color})` }}>{value}</span></div>
}
function Alerta({ msg, tipo }: { msg: string; tipo: 'success'|'warn'|'info' }) {
  const c = tipo==='success'?'46,204,113':tipo==='warn'?'230,126,34':'52,152,219'
  return <div style={{ padding:'10px 14px', borderRadius:10, fontSize:13, display:'flex', gap:8, background:`rgba(${c},0.1)`, border:`0.5px solid rgba(${c},0.25)`, color:`rgb(${c})`, marginBottom:'1rem' }}>{msg}</div>
}

export default function App() {
  const { t } = useTranslation()
  const [nav, setNav] = useState<Nav>('dashboard')
  const [lang, setLang] = useState(localStorage.getItem('robinho_lang') || 'pt')
  const [pesos, setPesos] = useState(PESOS_PADRAO)
  const [pNome, setPNome] = useState('')
  const [pResp, setPResp] = useState('Robson Ramos')
  const [pCargo, setPCargo] = useState('')
  const [pDesc, setPDesc] = useState('')
  const [pSens, setPSens] = useState<'strict'|'normal'|'flex'>('normal')
  const [limAp, setLimAp] = useState(70)
  const [limPot, setLimPot] = useState(40)
  const [d8elim, setD8elim] = useState(false)
  const [d4ativo, setD4ativo] = useState(true)
  const [d9i1, setD9i1] = useState('Inglês'); const [d9n1, setD9n1] = useState('avancado')
  const [d9i2, setD9i2] = useState('Espanhol'); const [d9n2, setD9n2] = useState('intermediario')
  const [d10cidades, setD10cidades] = useState('')
  const [alert, setAlert] = useState<{msg:string;tipo:'success'|'warn'|'info'}|null>(null)
  const [processoId, setProcessoId] = useState<string|null>(null)
  const [keywords, setKeywords] = useState<string[]>([])
  const [csvCols, setCsvCols] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string,string>[]>([])
  const [mapeamento, setMapeamento] = useState<Record<string,string>>({})
  const [dropText, setDropText] = useState('')
  const [step, setStep] = useState(1)
  const [progresso, setProgresso] = useState(0)
  const [processando, setProcessando] = useState(false)
  const [candidatos, setCandidatos] = useState<(Candidato & { rank?: number })[]>([])
  const [filtro, setFiltro] = useState<'todos'|Classificacao>('todos')

  const mudarIdioma = (l: string) => { setLang(l); localStorage.setItem('robinho_lang', l); i18n.changeLanguage(l) }
  const mostrarAlerta = (msg: string, tipo: 'success'|'warn'|'info' = 'success') => { setAlert({ msg, tipo }); setTimeout(() => setAlert(null), 3500) }
  const somaPesos = Object.values(pesos).reduce((s, v) => s + v, 0)
  const pct = (v: number, t: number) => t ? Math.round(v/t*100) : 0

  useEffect(() => {
    if (pDesc.length < 30) { setKeywords([]); return }
    const words = pDesc.toLowerCase().replace(/[^a-záàãâéêíóôõúüç\s]/g,' ').split(/\s+/).filter(w=>w.length>4)
    const freq: Record<string,number> = {}; words.forEach(w => freq[w]=(freq[w]||0)+1)
    setKeywords(Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,18).map(([w])=>w))
  }, [pDesc])

  const salvarConfig = async () => {
    const p = await salvarProcesso({ id: processoId||undefined, nome: pNome||'Processo sem nome', responsavel: pResp, cargo_buscado: pCargo, descritivo: pDesc, sensibilidade: pSens, limiar_aprovado: limAp, limiar_potencial: limPot, pesos, config:{ d8_eliminatorio:d8elim, d4_ativo:d4ativo, d9_idioma1:d9i1, d9_nivel1:d9n1, d9_idioma2:d9i2, d9_nivel2:d9n2, d10_cidades:d10cidades.split(',').map(s=>s.trim()).filter(Boolean) }, idioma: lang as 'pt'|'en'|'es' })
    if (p) { setProcessoId(p.id); mostrarAlerta(t('common.salvo')) } else mostrarAlerta(t('common.erro'), 'warn')
  }

  const handleFile = async (file: File) => {
    setDropText(`✅ ${file.name} — ${(file.size/1024).toFixed(1)} KB`)
    const result = await parseArquivo(file)
    setCsvCols(result.colunas); setCsvRows(result.rows); setMapeamento(autoMapear(result.colunas)); setStep(3)
  }

  const iniciarTriagem = async () => {
    if (!csvRows.length) return
    setProcessando(true); setProgresso(0)
    const cfg: ConfigTriagem = { descritivo:pDesc, cargo_buscado:pCargo, sensibilidade:pSens, limiar_aprovado:limAp, limiar_potencial:limPot, pesos, config:{ d8_eliminatorio:d8elim, d4_ativo:d4ativo, d9_idioma1:d9i1, d9_nivel1:d9n1, d9_idioma2:d9i2, d9_nivel2:d9n2, d10_cidades:d10cidades.split(',').map(s=>s.trim()).filter(Boolean) } }
    const dadosMap: DadosCandidato[] = csvRows.map(r => mapearCandidato(r, mapeamento))
    const resultados = dadosMap.map((d, i) => { const r = calcularScore(cfg, d); setProgresso(Math.round((i+1)/dadosMap.length*100)); return { ...r, score_custom:{}, ...d, id:String(i), triagem_id:'local', processo_id:'local', wpp_enviado:false, wpp_enviado_at:null, salario_pret:null, dados_brutos:d.dados_brutos, created_at:new Date().toISOString(), rank:i+1 } as unknown as Candidato & {rank:number} })
    try {
      const pid = processoId || (await salvarProcesso({ nome:pNome||'Processo', responsavel:pResp, cargo_buscado:pCargo, descritivo:pDesc, sensibilidade:pSens, limiar_aprovado:limAp, limiar_potencial:limPot, pesos, config:{}, idioma:lang as 'pt'|'en'|'es' }))?.id
      if (pid) {
        const tr = await criarTriagem(pid, `Triagem ${new Date().toLocaleDateString('pt-BR')}`, mapeamento)
        if (tr) {
          await salvarCandidatos(tr.id, pid, dadosMap, cfg, (done, total) => setProgresso(Math.round(done/total*100)))
          const saved = await listarCandidatos(tr.id)
          if (saved.length) { setCandidatos(saved.map((c,i) => ({...c, rank:i+1}))); setProcessando(false); setStep(4); setNav('results'); return }
        }
      }
    } catch(e) { console.warn('[Robinho] Supabase indisponível, usando dados locais.', e) }
    const sorted = resultados.sort((a,b) => b.score_total - a.score_total).map((c,i) => ({...c, rank:i+1}))
    setCandidatos(sorted); setProcessando(false); setStep(4); setNav('results')
  }

  const candidatosFiltrados = filtro === 'todos' ? candidatos : candidatos.filter(c => c.classificacao === filtro)
  const stats = { total:candidatos.length, ap:candidatos.filter(c=>c.classificacao==='aprovado').length, pot:candidatos.filter(c=>c.classificacao==='potencial').length, rep:candidatos.filter(c=>c.classificacao==='reprovado').length, avg:candidatos.length ? Math.round(candidatos.reduce((s,c)=>s+c.score_total,0)/candidatos.length) : 0 }
  const top5 = [...candidatos].sort((a,b)=>b.score_total-a.score_total).slice(0,5)

  const S: React.CSSProperties = {}
  const navBtn = (n: Nav, label: string) => (
    <button key={n} onClick={() => setNav(n)} style={{ padding:'8px 16px', borderRadius:'6px 6px 0 0', fontSize:12, fontWeight:500, background:'transparent', border:'none', cursor:'pointer', whiteSpace:'nowrap', letterSpacing:.3, borderBottom:`2px solid ${nav===n?'var(--gold)':'transparent'}`, color:nav===n?'var(--gold)':'var(--text-muted)', transition:'all .18s' }}>{label}</button>
  )

  const labelStyle: React.CSSProperties = { fontSize:11, fontWeight:600, color:'var(--gold)', letterSpacing:.8, textTransform:'uppercase', display:'block', marginBottom:6 }
  const secTitle = (txt: string) => <p style={{ fontSize:12, fontWeight:600, color:'var(--gold)', letterSpacing:.8, textTransform:'uppercase', marginBottom:'1rem' }}>{txt}</p>

  return (
    <div style={{ minHeight:'100vh' }}>
      {/* HEADER */}
      <header style={{ padding:'0 2rem', height:64, display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(10,10,15,0.88)', borderBottom:'0.5px solid rgba(201,168,76,0.25)', position:'sticky', top:0, zIndex:100, backdropFilter:'blur(20px)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:32, height:32, borderRadius:6, background:'linear-gradient(135deg,#C41E3A,#8B1325)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#fff', fontSize:14 }}>R</div>
          <div>
            <div style={{ fontSize:15, fontWeight:600 }}>{t('brand')}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:.5, textTransform:'uppercase', marginTop:1 }}>{t('subtitle')}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <select value={lang} onChange={e=>mudarIdioma(e.target.value)} style={{ width:'auto', padding:'5px 10px', fontSize:12, background:'rgba(255,255,255,0.06)', border:'0.5px solid var(--border)', borderRadius:6, color:'var(--text)' }}>
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <Badge color="201,168,76">v1.7</Badge>
          <Badge color="46,204,113">● Ativo</Badge>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ display:'flex', gap:2, padding:'1.25rem 2rem 0', borderBottom:'0.5px solid var(--border)', background:'rgba(10,10,15,0.6)', backdropFilter:'blur(12px)', overflowX:'auto' }}>
        {navBtn('dashboard', t('nav.dashboard'))}
        {navBtn('params', t('nav.params'))}
        {navBtn('triagem', t('nav.triagem'))}
        {navBtn('results', t('nav.results'))}
        {navBtn('whatsapp', t('nav.whatsapp'))}
        {navBtn('config', t('nav.config'))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', paddingBottom:4 }}>
          <a
            href="https://minerva-foods-kairos.vercel.app/"
            target="_blank"
            rel="noreferrer"
            style={{
              padding:'7px 20px', borderRadius:8, fontSize:12, fontWeight:700,
              background:'linear-gradient(135deg,#C9A84C,#8B6914)',
              color:'#fff', textDecoration:'none', letterSpacing:.5,
              boxShadow:'0 2px 10px rgba(201,168,76,0.45)',
              border:'0.5px solid rgba(201,168,76,0.6)',
              whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6,
            }}
          >⚡ Kairós</a>
        </div>
      </nav>

      <main style={{ padding:'2rem', maxWidth:1400, margin:'0 auto' }}>
        {alert && <Alerta msg={alert.msg} tipo={alert.tipo} />}

        {/* DASHBOARD */}
        {nav === 'dashboard' && (
          <div className="fade-in">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem' }}>
              <div><h1 style={{ fontSize:20, fontWeight:600 }}>{t('dashboard.title')}</h1><p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{t('dashboard.sub')}</p></div>
              <button onClick={()=>setNav('triagem')} style={{ padding:'9px 18px', borderRadius:8, fontSize:13, fontWeight:600, background:'linear-gradient(135deg,#C41E3A,#8B1325)', color:'#fff', border:'none', cursor:'pointer' }}>{t('dashboard.newTriagem')}</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
              {[{label:t('dashboard.total'),value:stats.total,color:'var(--text)',sub:'100%'},{label:t('dashboard.aprovados'),value:stats.ap,color:'var(--green)',sub:pct(stats.ap,stats.total)+'%'},{label:t('dashboard.potenciais'),value:stats.pot,color:'var(--gold)',sub:pct(stats.pot,stats.total)+'%'},{label:t('dashboard.reprovados'),value:stats.rep,color:'var(--red-light)',sub:`Score médio: ${stats.avg}`}].map((k,i) => (
                <div key={i} className="glass" style={{ padding:'1.25rem', textAlign:'center' }}>
                  <div style={{ fontSize:28, fontWeight:700, color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', letterSpacing:.5, textTransform:'uppercase', marginTop:4 }}>{k.label}</div>
                  <div style={{ fontSize:10, color:'var(--text-dim)', marginTop:4 }}>{k.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem' }}>
              <div className="glass" style={{ padding:'1.5rem' }}>
                <h3 style={{ fontSize:14, fontWeight:600, marginBottom:'1.25rem' }}>{t('dashboard.funil')}</h3>
                {!stats.total ? <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-muted)', fontSize:13 }}>{t('dashboard.noData')}</div> :
                  [{label:t('dashboard.total'),v:stats.total,color:'52,152,219',p:100},{label:t('dashboard.potenciais'),v:stats.ap+stats.pot,color:'201,168,76',p:pct(stats.ap+stats.pot,stats.total)},{label:t('dashboard.aprovados'),v:stats.ap,color:'46,204,113',p:pct(stats.ap,stats.total)}].map((f,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'0.5px solid var(--border)' }}>
                      <span style={{ fontSize:12, color:'var(--text-muted)', minWidth:80 }}>{f.label}</span>
                      <div style={{ flex:1, height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}><div style={{ width:`${f.p}%`, height:'100%', background:`rgb(${f.color})`, borderRadius:3 }} /></div>
                      <span style={{ fontSize:13, fontWeight:600, color:`rgb(${f.color})`, minWidth:25 }}>{f.v}</span>
                      <span style={{ fontSize:10, color:'var(--text-dim)', minWidth:35 }}>{f.p}%</span>
                    </div>
                  ))
                }
              </div>
              <div className="glass" style={{ padding:'1.5rem' }}>
                <h3 style={{ fontSize:14, fontWeight:600, marginBottom:'1.25rem' }}>{t('dashboard.top5')}</h3>
                {!top5.length ? <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-muted)', fontSize:13 }}>{t('dashboard.noData')}</div> :
                  top5.map((c,i) => (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'0.5px solid var(--border)' }}>
                      <span style={{ fontSize:13, color:'var(--text-dim)', minWidth:20 }}>{i+1}</span>
                      <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:500 }}>{c.nome}</div><div style={{ fontSize:10, color:'var(--text-muted)' }}>{c.cargo_atual}</div></div>
                      <span style={{ fontSize:15, fontWeight:700, color:`rgb(${BADGE_COLORS[c.classificacao]})` }}>{c.score_total}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {/* PARÂMETROS */}
        {nav === 'params' && (
          <div className="fade-in">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <div><h1 style={{ fontSize:20, fontWeight:600 }}>{t('params.title')}</h1><p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{t('params.sub')}</p></div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ width:56, height:56, borderRadius:'50%', border:`2px solid ${somaPesos===100?'var(--green)':'var(--orange)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, color:somaPesos===100?'var(--green)':'var(--orange)' }}>{somaPesos}</div>
                <span style={{ fontSize:9, color:'var(--text-dim)' }}>pts</span>
              </div>
            </div>
            <div className="glass" style={{ padding:'1.5rem', marginBottom:'1.25rem' }}>
              {secTitle('📋 INFORMAÇÕES DA VAGA')}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                {[{label:t('params.processo'),val:pNome,set:setPNome,ph:'Ex: Gerente de Exportações · Minerva Foods'},{label:t('params.responsavel'),val:pResp,set:setPResp,ph:''},{label:t('params.cargo'),val:pCargo,set:setPCargo,ph:'Ex: Gerente de Exportações'}].map((f,i) => (
                  <div key={i}><label style={labelStyle}>{f.label}</label><input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} /></div>
                ))}
                <div><label style={labelStyle}>{t('params.sensibilidade')}</label>
                  <select value={pSens} onChange={e=>setPSens(e.target.value as typeof pSens)}>
                    <option value="strict">{t('params.sens_strict')}</option>
                    <option value="normal">{t('params.sens_normal')}</option>
                    <option value="flex">{t('params.sens_flex')}</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop:'1rem' }}><label style={labelStyle}>{t('params.descritivo')}</label><textarea value={pDesc} onChange={e=>setPDesc(e.target.value)} placeholder={t('params.descritivo_ph')} rows={5} /></div>
              {keywords.length > 0 && <div style={{ marginTop:'1rem' }}><p style={{ fontSize:10, color:'var(--text-muted)', letterSpacing:.5, textTransform:'uppercase', marginBottom:6 }}>{t('params.termos')}</p>{keywords.map(k=><span key={k} style={{ display:'inline-block', padding:'2px 8px', background:'rgba(201,168,76,0.1)', color:'var(--gold-light)', border:'0.5px solid rgba(201,168,76,0.25)', borderRadius:20, fontSize:11, margin:2 }}>{k}</span>)}</div>}
            </div>
            <div className="glass" style={{ padding:'1.5rem', marginBottom:'1.25rem' }}>
              {secTitle('🎯 LIMIARES DE CLASSIFICAÇÃO')}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                <div><label style={labelStyle}>{t('params.limiar_ap')}</label><input type="number" value={limAp} onChange={e=>setLimAp(+e.target.value)} min={1} max={100} /><p style={{ fontSize:10, color:'var(--text-dim)', marginTop:4 }}>Score ≥ {limAp} pts → ✅</p></div>
                <div><label style={labelStyle}>{t('params.limiar_pot')}</label><input type="number" value={limPot} onChange={e=>setLimPot(+e.target.value)} min={1} max={100} /><p style={{ fontSize:10, color:'var(--text-dim)', marginTop:4 }}>Score ≥ {limPot} pts → ⚡</p></div>
              </div>
            </div>
            <div className="glass" style={{ padding:'1.5rem', marginBottom:'1.25rem' }}>
              {secTitle('⚖️ PESOS DAS DIMENSÕES')}
              {([['d1','Aderência ao Descritivo'],['d2','Perfil LinkedIn'],['d3','Tempo na Posição'],['d4','Liderança'],['d5','Formação Acadêmica'],['d8','Indústria de Carne'],['d9','Idiomas'],['d10','Localização']] as [keyof typeof pesos,string][]).map(([k,label]) => (
                <div key={k} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:'0.5px solid var(--border)' }}>
                  <span style={{ fontSize:12, flex:1, color:'var(--text-muted)' }}>{label}</span>
                  <input type="number" value={pesos[k]} min={0} max={100} style={{ width:70, textAlign:'center' }} onChange={e=>setPesos(p=>({...p,[k]:Math.max(0,Math.min(100,+e.target.value))}))} />
                  <span style={{ fontSize:11, color:'var(--text-dim)' }}>pts</span>
                </div>
              ))}
              <div style={{ marginTop:'1rem' }}>
                <label style={labelStyle}>D9 — Idioma 1</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                  <select value={d9i1} onChange={e=>setD9i1(e.target.value)}><option>Inglês</option><option>Espanhol</option><option>Francês</option><option>Alemão</option></select>
                  <select value={d9n1} onChange={e=>setD9n1(e.target.value)}><option value="basico">Básico</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option><option value="fluente">Fluente</option></select>
                </div>
                <label style={labelStyle}>D9 — Idioma 2</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                  <select value={d9i2} onChange={e=>setD9i2(e.target.value)}><option>Espanhol</option><option>Inglês</option><option>Francês</option><option>Não exigido</option></select>
                  <select value={d9n2} onChange={e=>setD9n2(e.target.value)}><option value="basico">Básico</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select>
                </div>
                <label style={labelStyle}>D10 — Cidades aceitas</label>
                <input value={d10cidades} onChange={e=>setD10cidades(e.target.value)} placeholder="São Paulo, Campinas, Ribeirão Preto..." style={{ marginBottom:8 }} />
                <div style={{ display:'flex', gap:10, marginTop:8 }}>
                  <input type="checkbox" checked={d8elim} onChange={e=>setD8elim(e.target.checked)} id="d8e" style={{ width:'auto' }} />
                  <label htmlFor="d8e" style={{ fontSize:12, cursor:'pointer' }}>D8 — Indústria de carne como critério eliminatório</label>
                </div>
                <div style={{ display:'flex', gap:10, marginTop:8 }}>
                  <input type="checkbox" checked={d4ativo} onChange={e=>setD4ativo(e.target.checked)} id="d4a" style={{ width:'auto' }} />
                  <label htmlFor="d4a" style={{ fontSize:12, cursor:'pointer' }}>D4 — Avaliar experiência em liderança</label>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'.75rem', flexWrap:'wrap' }}>
              <button onClick={salvarConfig} style={{ padding:'10px 20px', borderRadius:8, fontSize:13, fontWeight:600, background:'linear-gradient(135deg,#C41E3A,#8B1325)', color:'#fff', border:'none', cursor:'pointer' }}>{t('params.salvar')}</button>
              <button onClick={()=>{ const k=Object.keys(pesos) as (keyof typeof pesos)[]; const per=Math.floor(100/k.length); const rem=100-per*k.length; const n={} as typeof pesos; k.forEach((key,i)=>{n[key]=per+(i===0?rem:0)}); setPesos(n) }} style={{ padding:'10px 20px', borderRadius:8, fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.08)', color:'var(--text)', border:'0.5px solid var(--border)', cursor:'pointer' }}>{t('params.balancear')}</button>
              <button onClick={()=>setPesos(PESOS_PADRAO)} style={{ padding:'10px 20px', borderRadius:8, fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.08)', color:'var(--text)', border:'0.5px solid var(--border)', cursor:'pointer' }}>{t('params.restaurar')}</button>
            </div>
          </div>
        )}

        {/* TRIAGEM */}
        {nav === 'triagem' && (
          <div className="fade-in">
            <h1 style={{ fontSize:20, fontWeight:600, marginBottom:4 }}>{t('triagem.title')}</h1>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:'1.5rem' }}>{t('triagem.sub')}</p>
            <div style={{ display:'flex', marginBottom:'2rem' }}>
              {[t('triagem.step1'),t('triagem.step2'),t('triagem.step3'),t('triagem.step4')].map((s,i) => (
                <div key={i} style={{ flex:1, padding:'10px', textAlign:'center', fontSize:11, fontWeight:600, background:step===i+1?'rgba(201,168,76,0.1)':step>i+1?'rgba(46,204,113,0.08)':'rgba(255,255,255,0.03)', border:'0.5px solid', borderColor:step===i+1?'rgba(201,168,76,0.4)':step>i+1?'rgba(46,204,113,0.3)':'var(--border)', color:step===i+1?'var(--gold)':step>i+1?'var(--green)':'var(--text-dim)', borderRadius:i===0?'8px 0 0 8px':i===3?'0 8px 8px 0':0 }}>
                  <span style={{ display:'block', fontSize:18, marginBottom:2 }}>{i+1}</span>{s}
                </div>
              ))}
            </div>
            <div className="glass" style={{ padding:'1.5rem', marginBottom:'1.25rem' }}>
              <div onClick={()=>document.getElementById('csv-input')?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f)}} style={{ border:'1.5px dashed rgba(201,168,76,0.4)', borderRadius:12, padding:'2.5rem', textAlign:'center', cursor:'pointer', background:'rgba(201,168,76,0.03)' }}>
                <input type="file" id="csv-input" style={{ display:'none' }} accept=".csv,.xlsx,.xlsm,.xls" onChange={e=>{if(e.target.files?.[0])handleFile(e.target.files[0])}} />
                <div style={{ fontSize:36, marginBottom:'1rem', opacity:.5 }}>📊</div>
                <div style={{ fontSize:14, fontWeight:500, color:'var(--text-muted)', marginBottom:4 }}>{dropText || t('triagem.dropzone')}</div>
                <div style={{ fontSize:11, color:'var(--text-dim)' }}>{t('triagem.dropzone_sub')}</div>
              </div>
            </div>
            {csvCols.length > 0 && (
              <div className="glass" style={{ padding:'1.5rem', marginBottom:'1.25rem' }}>
                {secTitle(`🤖 ${t('triagem.mapeamento')}`)}
                <Alerta msg={`${csvCols.length} ${t('triagem.colunas')} · ${csvRows.length} ${t('triagem.candidatos')}`} tipo="info" />
                {([['nome',t('triagem.col_nome')],['tel',t('triagem.col_tel')],['email',t('triagem.col_email')],['linkedin',t('triagem.col_linkedin')],['cargo',t('triagem.col_cargo')],['empresa',t('triagem.col_empresa')],['cidade',t('triagem.col_cidade')],['exp',t('triagem.col_exp')],['form',t('triagem.col_form')],['idiomas',t('triagem.col_idiomas')],['salario',t('triagem.col_salario')]] as [string,string][]).map(([k,label]) => (
                  <div key={k} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'rgba(255,255,255,0.03)', borderRadius:8, marginBottom:6 }}>
                    <span style={{ fontSize:12, color:'var(--text-muted)', flex:1 }}>{label}</span>
                    <select value={mapeamento[k]||''} onChange={e=>setMapeamento(m=>({...m,[k]:e.target.value}))} style={{ flex:1.5 }}>
                      <option value="">{t('common.nao_mapear')}</option>
                      {csvCols.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                    {mapeamento[k] && <Badge color="46,204,113">{t('common.auto')}</Badge>}
                  </div>
                ))}
                <button onClick={iniciarTriagem} style={{ marginTop:'1rem', width:'100%', padding:'12px', borderRadius:8, fontSize:14, fontWeight:600, background:'linear-gradient(135deg,#C41E3A,#8B1325)', color:'#fff', border:'none', cursor:'pointer' }}>🚀 {t('triagem.iniciar')}</button>
              </div>
            )}
            {processando && (
              <div className="glass" style={{ padding:'1.5rem' }}>
                <p style={{ fontSize:14, fontWeight:600, marginBottom:'1rem' }}>⏳ {t('triagem.processando')}</p>
                <div style={{ background:'rgba(255,255,255,0.06)', borderRadius:8, height:8, overflow:'hidden', marginBottom:'.75rem' }}><div style={{ height:'100%', background:'linear-gradient(90deg,#C41E3A,#C9A84C)', borderRadius:8, width:`${progresso}%`, transition:'width .3s' }} /></div>
                <p style={{ fontSize:12, color:'var(--text-muted)' }}>{progresso}%</p>
              </div>
            )}
          </div>
        )}

        {/* RESULTADOS */}
        {nav === 'results' && (
          <div className="fade-in">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <div><h1 style={{ fontSize:20, fontWeight:600 }}>{t('results.title')}</h1><p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{candidatosFiltrados.length} de {candidatos.length} candidatos</p></div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>exportarCSV(candidatosFiltrados,`triagem_minerva_${Date.now()}.csv`)} style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:600, background:'rgba(255,255,255,0.08)', color:'var(--text)', border:'0.5px solid var(--border)', cursor:'pointer' }}>⬇️ {t('results.exportar')}</button>
                <select value={filtro} onChange={e=>setFiltro(e.target.value as typeof filtro)} style={{ padding:'8px 12px', borderRadius:8, fontSize:12, width:180 }}>
                  <option value="todos">{t('results.todos')}</option>
                  <option value="aprovado">{t('results.aprovados')}</option>
                  <option value="potencial">{t('results.potenciais')}</option>
                  <option value="reprovado">{t('results.reprovados')}</option>
                </select>
              </div>
            </div>
            <div className="glass" style={{ padding:'1.25rem' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr>{[t('results.rank'),t('results.nome'),t('results.score'),t('results.classe'),t('results.destaque'),t('results.cargo'),t('results.cidade'),t('results.telefone'),t('results.linkedin'),t('results.acao')].map(h=><th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--text-muted)', letterSpacing:.8, textTransform:'uppercase', background:'rgba(255,255,255,0.04)', borderBottom:'0.5px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {!candidatosFiltrados.length ? <tr><td colSpan={10} style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>Nenhum candidato encontrado.</td></tr> :
                      candidatosFiltrados.map((c,i) => {
                        const color = BADGE_COLORS[c.classificacao]||'136,135,128'
                        const lbl = t(`results.classificacao.${c.classificacao}`)||c.classificacao
                        const wppNum = (c.telefone||'').replace(/\D/g,'')
                        const wppMsg = encodeURIComponent(`Olá, ${(c.nome||'').split(',')[0]}! Minerva Foods — ${pNome}`)
                        return (
                          <tr key={c.id} style={{ borderBottom:'0.5px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding:'10px 12px', color:'var(--text-muted)' }}>{c.rank??i+1}</td>
                            <td style={{ padding:'10px 12px', fontWeight:500 }}>{c.nome}</td>
                            <td style={{ padding:'10px 12px' }}><ScoreBar value={c.score_total} color={color} /></td>
                            <td style={{ padding:'10px 12px' }}><Badge color={color}>{lbl}</Badge></td>
                            <td style={{ padding:'10px 12px' }}>{c.destaque?'⭐':''}</td>
                            <td style={{ padding:'10px 12px', color:'var(--text-muted)' }}>{c.cargo_atual}</td>
                            <td style={{ padding:'10px 12px', color:'var(--text-muted)' }}>{c.cidade}{c.estado?`, ${c.estado}`:''}</td>
                            <td style={{ padding:'10px 12px' }}>{c.telefone}</td>
                            <td style={{ padding:'10px 12px' }}>{c.linkedin_url&&c.linkedin_url!=='—'?<a href={`https://${c.linkedin_url}`} target="_blank" rel="noreferrer" style={{ color:'var(--blue)', fontSize:11 }}>Ver →</a>:<span style={{ color:'var(--text-dim)' }}>—</span>}</td>
                            <td style={{ padding:'10px 12px' }}>{wppNum?<a href={`https://wa.me/55${wppNum}?text=${wppMsg}`} target="_blank" rel="noreferrer" style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600, background:'rgba(255,255,255,0.08)', color:'var(--text)', border:'0.5px solid var(--border)', textDecoration:'none' }}>💬</a>:null}</td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* WHATSAPP */}
        {nav === 'whatsapp' && (
          <div className="fade-in">
            <h1 style={{ fontSize:20, fontWeight:600, marginBottom:4 }}>{t('whatsapp.title')}</h1>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:'1.5rem' }}>{t('whatsapp.sub')}</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem' }}>
              <div>
                {(['ap','pot','rep'] as const).map(tipo => (
                  <div key={tipo} className="glass" style={{ padding:'1.5rem', marginBottom:'1rem' }}>
                    {secTitle(t(`whatsapp.msg_${tipo}`))}
                    <textarea rows={5} defaultValue={tipo==='ap'?`Olá, {{nome}}! 😊\n\nSua candidatura para *{{vaga}}* na Minerva Foods foi avaliada positivamente.\n\nGostaríamos de agendar uma conversa. Qual seria a melhor data?\n\nAtt,\n{{responsavel}}\nMinerva Foods`:tipo==='pot'?`Olá, {{nome}}!\n\nSeu perfil para *{{vaga}}* foi adicionado à nossa base de talentos.\n\nAtt,\n{{responsavel}}`:`Olá, {{nome}}.\n\nAgradecemos sua candidatura para *{{vaga}}*. Não seguiremos neste momento.\n\nMinerva Foods`} />
                    <div style={{ marginTop:6, fontSize:10, color:'var(--text-dim)' }}>{['{{nome}}','{{vaga}}','{{responsavel}}','{{score}}'].map(v=><span key={v} style={{ display:'inline-block', padding:'1px 6px', background:'rgba(255,255,255,0.07)', borderRadius:4, margin:2 }}>{v}</span>)}</div>
                  </div>
                ))}
              </div>
              <div className="skeu" style={{ padding:'1.5rem', alignSelf:'start' }}>
                {secTitle(`⚙️ ${t('whatsapp.disparar')}`)}
                {[t('whatsapp.auto_ap'),t('whatsapp.auto_pot'),t('whatsapp.auto_rep')].map((label,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'0.5px solid var(--border)' }}>
                    <span style={{ fontSize:13 }}>{label}</span>
                    <input type="checkbox" defaultChecked={i===0} style={{ width:16, height:16, cursor:'pointer', accentColor:'var(--red)' }} />
                  </div>
                ))}
                <div style={{ marginTop:'1rem' }}><label style={labelStyle}>{t('whatsapp.delay')}</label><select><option>2s</option><option>5s</option><option>10s</option></select></div>
                <button style={{ marginTop:'1.25rem', width:'100%', padding:'12px', borderRadius:8, fontSize:13, fontWeight:600, background:'linear-gradient(135deg,#C41E3A,#8B1325)', color:'#fff', border:'none', cursor:'pointer' }}>📤 {t('whatsapp.disparar')}</button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIGURAÇÕES */}
        {nav === 'config' && (
          <div className="fade-in">
            <h1 style={{ fontSize:20, fontWeight:600, marginBottom:4 }}>{t('config.title')}</h1>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:'1.5rem' }}>{t('config.sub')}</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem' }}>
              <div className="skeu" style={{ padding:'1.5rem' }}>
                {secTitle('🔗 INTEGRAÇÕES')}
                {[[t('config.gupy_key'),'gp_xxxxxxxxxxxxxxxx'],[t('config.wpp_key'),'wha_xxxxxxxxxxxxxxxx']].map(([label,ph])=>(
                  <div key={label} style={{ marginBottom:'1rem' }}>
                    <label style={labelStyle}>{label}</label>
                    <div style={{ display:'flex', gap:6 }}><input type="password" placeholder={ph} style={{ flex:1 }} /><button style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:600, background:'rgba(255,255,255,0.08)', color:'var(--text)', border:'0.5px solid var(--border)', cursor:'pointer', whiteSpace:'nowrap' }}>{t('config.testar')}</button></div>
                  </div>
                ))}
              </div>
              <div className="skeu" style={{ padding:'1.5rem' }}>
                {secTitle('⚙️ SISTEMA')}
                <div style={{ marginBottom:'1rem' }}><label style={labelStyle}>{t('config.versao')}</label><input value="v1.7.0 — Production Ready" readOnly style={{ opacity:.6 }} /></div>
                <div style={{ marginBottom:'1rem' }}><label style={labelStyle}>{t('config.idioma_sistema')}</label>
                  <select value={lang} onChange={e=>mudarIdioma(e.target.value)}>
                    {LANGS.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
                <Alerta msg={t('common.gupy_wip')} tipo="warn" />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
