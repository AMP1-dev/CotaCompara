import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, mensagemErro, APP_URL } from '../lib/supabase'
import { formatarData, linkWhatsApp, copiarTexto } from '../lib/format'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import { IconeWhats } from '../components/Icones'

export const PLANOS = {
  gratis:   { rotulo: 'Grátis',   cor: '' },
  basico:   { rotulo: 'Básico',   cor: 'azul' },
  pro:      { rotulo: 'Pro',      cor: 'verde' },
  cortesia: { rotulo: 'Cortesia', cor: 'laranja' },
}

const DIA = 86400000
const hojeISO = () => new Date().toISOString().slice(0, 10)
const vencido = (c) => c.plano !== 'gratis' && c.plano_validade && c.plano_validade < hojeISO()
const diasDesde = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DIA) : null)

function rotuloAcesso(d) {
  const n = diasDesde(d)
  if (n == null) return 'nunca'
  if (n === 0) return 'hoje'
  if (n === 1) return 'ontem'
  return `há ${n} dias`
}

export default function Admin() {
  const [clientes, setClientes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [sel, setSel] = useState(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_listar_clientes')
    if (error) setErro(mensagemErro(error))
    setClientes(data || [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const resumo = useMemo(() => {
    const r = { total: clientes.length, ativos30: 0, pagantes: 0, bloqueados: 0, cotacoes: 0, vencidos: 0 }
    for (const c of clientes) {
      if (diasDesde(c.ultimo_acesso) != null && diasDesde(c.ultimo_acesso) <= 30) r.ativos30++
      if (['basico', 'pro'].includes(c.plano) && !vencido(c)) r.pagantes++
      if (c.bloqueado) r.bloqueados++
      if (vencido(c)) r.vencidos++
      r.cotacoes += c.qtd_cotacoes
    }
    return r
  }, [clientes])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return clientes.filter((c) => {
      if (filtro === 'pagantes' && !['basico', 'pro'].includes(c.plano)) return false
      if (filtro === 'gratis' && c.plano !== 'gratis') return false
      if (filtro === 'bloqueados' && !c.bloqueado) return false
      if (filtro === 'vencidos' && !vencido(c)) return false
      if (filtro === 'sem_cnpj' && c.cnpj) return false
      if (!q) return true
      return [c.nome, c.razao_social, c.cnpj, c.email, c.responsavel, c.cidade, c.telefone]
        .some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [clientes, busca, filtro])

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>Administração</h1>
          <div className="subtitulo">Clientes do CotaCompara, planos e acesso.</div>
        </div>
        <button className="btn btn-secundario btn-pequeno" onClick={() => { setCarregando(true); carregar() }}>Atualizar</button>
      </div>

      {erro && <div className="alerta alerta-erro">{erro}</div>}

      <div className="grid adm-stats">
        <div className="card stat destaque"><div className="rotulo">Clientes</div><div className="valor">{resumo.total}</div></div>
        <div className="card stat verde"><div className="rotulo">Ativos (30 dias)</div><div className="valor">{resumo.ativos30}</div></div>
        <div className="card stat amarelo"><div className="rotulo">Pagantes</div><div className="valor">{resumo.pagantes}</div></div>
        <div className="card stat laranja"><div className="rotulo">Plano vencido</div><div className="valor">{resumo.vencidos}</div></div>
        <div className="card stat cinza"><div className="rotulo">Cotações criadas</div><div className="valor">{resumo.cotacoes}</div></div>
      </div>

      <div className="barra" style={{ marginTop: 16 }}>
        <div className="abas">
          {[['todos', 'Todos'], ['pagantes', 'Pagantes'], ['gratis', 'Grátis'], ['vencidos', 'Vencidos'],
            ['bloqueados', 'Bloqueados'], ['sem_cnpj', 'Sem CNPJ']].map(([id, r]) => (
            <button key={id} className={filtro === id ? 'ativo' : ''} onClick={() => setFiltro(id)}>{r}</button>
          ))}
        </div>
        <input className="input" placeholder="Buscar nome, CNPJ, e-mail, cidade..." value={busca}
          onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tabela-wrap">
          <table className="tabela adm-tabela">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contato</th>
                <th className="num">Cotações</th>
                <th className="num">Fornec.</th>
                <th className="num">Respostas</th>
                <th>Último acesso</th>
                <th>Plano</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td colSpan={8} className="texto-suave">Carregando...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={8} className="texto-suave">Nenhum cliente neste filtro.</td></tr>
              ) : filtrados.map((c) => {
                const pl = PLANOS[c.plano] || PLANOS.gratis
                return (
                  <tr key={c.empresa_id} className="clicavel" onClick={() => setSel(c)}>
                    <td>
                      <div className="adm-nome">{c.nome}</div>
                      <div className="adm-sub mono">{c.cnpj || <span className="adm-alerta">sem CNPJ</span>}</div>
                      <div className="adm-sub">{[c.cidade, c.uf].filter(Boolean).join(' / ')}</div>
                    </td>
                    <td>
                      <div>{c.responsavel || '—'}</div>
                      <div className="adm-sub">{c.email}</div>
                      {c.telefone && <div className="adm-sub">{c.telefone}</div>}
                    </td>
                    <td className="num">{c.qtd_cotacoes}</td>
                    <td className="num">{c.qtd_fornecedores}</td>
                    <td className="num">{c.qtd_respostas}</td>
                    <td>
                      <div>{rotuloAcesso(c.ultimo_acesso)}</div>
                      <div className="adm-sub">desde {formatarData(c.criado_em, false)}</div>
                    </td>
                    <td>
                      <Badge cor={pl.cor}>{pl.rotulo}</Badge>
                      {c.plano_validade && (
                        <div className={`adm-sub ${vencido(c) ? 'adm-alerta' : ''}`}>
                          {vencido(c) ? 'venceu ' : 'até '}{formatarData(c.plano_validade + 'T12:00:00', false)}
                        </div>
                      )}
                    </td>
                    <td>
                      {c.bloqueado ? <Badge cor="vermelho">bloqueado</Badge>
                        : !c.email_confirmado ? <Badge cor="laranja">e-mail pendente</Badge>
                        : <Badge cor="verde">ativo</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sel && <EditarCliente cliente={sel} onFechar={() => setSel(null)} onSalvo={() => { setSel(null); carregar() }} />}
    </>
  )
}

function EditarCliente({ cliente: c, onFechar, onSalvo }) {
  const [form, setForm] = useState({
    plano: c.plano || 'gratis',
    plano_validade: c.plano_validade || '',
    bloqueado: !!c.bloqueado,
    obs_admin: c.obs_admin || '',
  })
  const [msg, setMsg] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [enviandoReset, setEnviandoReset] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const somarDias = (dias) => {
    const base = form.plano_validade && form.plano_validade > hojeISO() ? new Date(form.plano_validade + 'T12:00:00') : new Date()
    base.setDate(base.getDate() + dias)
    setForm((f) => ({ ...f, plano_validade: base.toISOString().slice(0, 10), plano: f.plano === 'gratis' ? 'basico' : f.plano }))
  }

  const salvar = async () => {
    setMsg(null)
    if (form.bloqueado && !c.bloqueado &&
      !window.confirm(`Bloquear ${c.nome}? Ele continua vendo o histórico, mas não cria nem libera cotações.`)) return
    setSalvando(true)
    const { error } = await supabase.rpc('admin_atualizar_cliente', {
      p_empresa_id: c.empresa_id,
      p_plano: form.plano,
      p_plano_validade: form.plano_validade || null,
      p_bloqueado: form.bloqueado,
      p_obs_admin: form.obs_admin,
    })
    setSalvando(false)
    if (error) return setMsg({ tipo: 'erro', texto: mensagemErro(error) })
    onSalvo()
  }

  const enviarReset = async () => {
    if (!window.confirm(`Enviar para ${c.email} um link para criar nova senha?`)) return
    setEnviandoReset(true)
    const { error } = await supabase.auth.resetPasswordForEmail(c.email, { redirectTo: `${APP_URL}/nova-senha` })
    setEnviandoReset(false)
    setMsg(error
      ? { tipo: 'erro', texto: 'Não foi possível enviar: ' + error.message }
      : { tipo: 'ok', texto: `Link de redefinição enviado para ${c.email}.` })
  }

  const zap = linkWhatsApp(c.telefone, `Olá ${c.responsavel || ''}! Aqui é do suporte do CotaCompara.`)

  return (
    <Modal aberto titulo={c.nome} onFechar={onFechar} largura={640}
      rodape={<>
        <button className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
        <button className="btn btn-primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
      </>}>
      {msg && <div className={`alerta alerta-${msg.tipo}`}>{msg.texto}</div>}

      <div className="adm-ficha">
        <div><span>Razão social</span><strong>{c.razao_social || '—'}</strong></div>
        <div><span>CNPJ</span><strong className="mono">{c.cnpj || '—'} {c.situacao_cnpj && `(${c.situacao_cnpj})`}</strong></div>
        <div><span>Responsável</span><strong>{c.responsavel || '—'}</strong></div>
        <div><span>E-mail de acesso</span><strong>{c.email} {!c.email_confirmado && <Badge cor="laranja">não confirmado</Badge>}</strong></div>
        <div><span>Telefone</span><strong>{c.telefone || '—'}</strong></div>
        <div><span>Cidade</span><strong>{[c.cidade, c.uf].filter(Boolean).join(' / ') || '—'}</strong></div>
        <div><span>Cliente desde</span><strong>{formatarData(c.criado_em)}</strong></div>
        <div><span>Último acesso</span><strong>{c.ultimo_acesso ? formatarData(c.ultimo_acesso) : 'nunca'}</strong></div>
        <div><span>Uso</span><strong>{c.qtd_cotacoes} cotações · {c.qtd_fornecedores} fornecedores · {c.qtd_respostas} respostas</strong></div>
        <div><span>Última cotação</span><strong>{c.ultima_cotacao ? formatarData(c.ultima_cotacao) : '—'}</strong></div>
      </div>

      <div className="adm-acoes">
        <button className="btn btn-secundario btn-pequeno" onClick={enviarReset} disabled={enviandoReset}>
          {enviandoReset ? 'Enviando...' : 'Enviar link de nova senha'}
        </button>
        <button className="btn btn-secundario btn-pequeno" onClick={() => copiarTexto(c.email)}>Copiar e-mail</button>
        {zap && <a className="btn btn-secundario btn-pequeno" href={zap} target="_blank" rel="noreferrer"><IconeWhats /> WhatsApp</a>}
      </div>

      <h3 style={{ margin: '18px 0 10px' }}>Assinatura</h3>
      <div className="linha-campos">
        <div className="campo">
          <label>Plano</label>
          <select className="select" value={form.plano} onChange={set('plano')}>
            {Object.entries(PLANOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
        </div>
        <div className="campo">
          <label>Válido até</label>
          <input className="input" type="date" value={form.plano_validade} onChange={set('plano_validade')} />
          <div className="adm-atalhos">
            <button type="button" onClick={() => somarDias(30)}>+30 dias</button>
            <button type="button" onClick={() => somarDias(90)}>+90 dias</button>
            <button type="button" onClick={() => somarDias(365)}>+1 ano</button>
            {form.plano_validade && <button type="button" onClick={() => setForm({ ...form, plano_validade: '' })}>sem data</button>}
          </div>
        </div>
      </div>
      <div className="campo">
        <label>Anotações internas</label>
        <textarea className="textarea" value={form.obs_admin} onChange={set('obs_admin')}
          placeholder="Ex.: pagou via PIX em 10/10, combinado desconto, contato preferencial..." />
        <small>Só o administrador vê.</small>
      </div>
      <label className="adm-bloqueio">
        <input type="checkbox" checked={form.bloqueado} onChange={set('bloqueado')} />
        <span>
          <strong>Bloquear conta</strong>
          <small>O cliente entra e vê o histórico, mas não cria nem libera cotações.</small>
        </span>
      </label>
    </Modal>
  )
}
