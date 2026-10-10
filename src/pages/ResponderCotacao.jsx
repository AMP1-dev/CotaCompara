import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatarData, formatarMoeda, formatarQtd, numeroCotacao, parseNumero } from '../lib/format'
import Logo from '../components/Logo'

// Tela pública do fornecedor: abre pelo link /r/:token, sem login.
// Só conversa com o banco pelas funções cotacao_publica e responder_cotacao.

const MENSAGENS = {
  LINK_INVALIDO: 'Este link de cotação não é válido. Confira se ele foi copiado inteiro.',
  COTACAO_FECHADA: 'Esta cotação foi encerrada pelo comprador e não recebe mais preços.',
  PRAZO_ENCERRADO: 'O prazo para responder esta cotação terminou.',
  SEM_ITENS: 'Informe o preço de pelo menos um item.',
}

const traduzir = (err) => {
  const msg = err?.message || ''
  const chave = Object.keys(MENSAGENS).find((k) => msg.includes(k))
  if (chave) return MENSAGENS[chave]
  if (msg.toLowerCase().includes('failed to fetch')) return 'Sem conexão. Verifique sua internet e tente de novo.'
  return 'Não foi possível concluir. Tente novamente em instantes.'
}

const precoParaTexto = (n) =>
  n == null ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

export default function ResponderCotacao() {
  const { token } = useParams()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  // respostas por item: { [itemId]: { preco: '12,50', semItem: false, obs: '' } }
  const [resp, setResp] = useState({})
  const [cond, setCond] = useState({ prazo: '', pagamento: '', frete: '', obs: '' })
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    document.title = 'Cotação · CotaCompara'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const carregar = async () => {
    setCarregando(true)
    const { data, error } = await supabase.rpc('cotacao_publica', { p_token: token })
    if (error) {
      setErro(traduzir(error))
      setCarregando(false)
      return
    }
    setDados(data)
    const inicial = {}
    data.itens.forEach((i) => {
      inicial[i.id] = {
        preco: precoParaTexto(i.preco_unitario),
        semItem: i.disponivel === false,
        obs: '',
      }
    })
    setResp(inicial)
    const c = data.condicoes || {}
    setCond({
      prazo: c.prazo_entrega_dias ?? '',
      pagamento: c.condicao_pagamento || '',
      frete: c.frete != null ? precoParaTexto(c.frete) : '',
      obs: c.observacao || '',
    })
    if (data.empresa?.nome) document.title = `Cotação ${data.empresa.nome} · CotaCompara`
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const alterar = (id, campo, valor) =>
    setResp((r) => ({ ...r, [id]: { ...r[id], [campo]: valor } }))

  const formatarAoSair = (id) => {
    const n = parseNumero(resp[id]?.preco)
    if (Number.isFinite(n) && n >= 0) alterar(id, 'preco', precoParaTexto(n))
  }

  const totais = useMemo(() => {
    if (!dados) return { total: 0, cotados: 0, semPreco: 0 }
    let total = 0, cotados = 0, semPreco = 0
    dados.itens.forEach((i) => {
      const r = resp[i.id] || {}
      if (r.semItem) return
      const p = parseNumero(r.preco)
      if (Number.isFinite(p) && p >= 0) { total += p * Number(i.quantidade); cotados++ }
      else semPreco++
    })
    const frete = parseNumero(cond.frete)
    if (Number.isFinite(frete)) total += frete
    return { total, cotados, semPreco }
  }, [dados, resp, cond.frete])

  const enviar = async () => {
    setErroEnvio('')
    if (totais.cotados === 0) return setErroEnvio(MENSAGENS.SEM_ITENS)
    if (totais.semPreco > 0 &&
      !window.confirm(`${totais.semPreco} ${totais.semPreco === 1 ? 'item ficou' : 'itens ficaram'} sem preço e ${totais.semPreco === 1 ? 'será enviado' : 'serão enviados'} como "não tenho". Enviar assim mesmo?`))
      return

    const itens = dados.itens.map((i) => {
      const r = resp[i.id] || {}
      const p = parseNumero(r.preco)
      const temPreco = !r.semItem && Number.isFinite(p) && p >= 0
      return {
        item_id: i.id,
        preco_unitario: temPreco ? p : null,
        disponivel: temPreco,
        observacao: r.obs?.trim() || null,
      }
    })

    const prazo = parseInt(cond.prazo, 10)
    const frete = parseNumero(cond.frete)

    setEnviando(true)
    const { error } = await supabase.rpc('responder_cotacao', {
      p_token: token,
      p_itens: itens,
      p_prazo_entrega_dias: Number.isFinite(prazo) ? prazo : null,
      p_condicao_pagamento: cond.pagamento.trim() || null,
      p_frete: Number.isFinite(frete) ? frete : null,
      p_observacao: cond.obs.trim() || null,
    })
    setEnviando(false)
    if (error) return setErroEnvio(traduzir(error))

    setEnviado(true)
    window.scrollTo({ top: 0 })
    // tenta fechar a aba (o navegador só permite se ela foi aberta por script)
    setTimeout(() => { try { window.close() } catch { /* ignora */ } }, 2500)
  }

  /* ---------------- Telas ---------------- */

  if (carregando) {
    return <Casca><div className="carregando"><div className="spinner" /></div></Casca>
  }

  if (erro) {
    return (
      <Casca>
        <div className="card resp-aviso">
          <div className="resp-icone erro">!</div>
          <h2>Não foi possível abrir a cotação</h2>
          <p>{erro}</p>
        </div>
      </Casca>
    )
  }

  const { empresa, cotacao, fornecedor, itens } = dados
  const local = [empresa.cidade, empresa.uf].filter(Boolean).join(' / ')

  if (enviado) {
    return (
      <Casca>
        <div className="card resp-aviso">
          <div className="resp-icone ok">✓</div>
          <h2>Cotação enviada!</h2>
          <p>
            Seus preços foram entregues para <strong>{empresa.nome}</strong>.
            {totais.total > 0 && <> Total informado: <strong>{formatarMoeda(totais.total)}</strong>.</>}
          </p>
          <p className="texto-suave">Você já pode fechar esta página.</p>
          {dados.pode_responder && (
            <button className="btn btn-secundario" onClick={() => { setEnviado(false); carregar() }}>
              Corrigir minha resposta
            </button>
          )}
        </div>
      </Casca>
    )
  }

  const somenteLeitura = !dados.pode_responder
  const motivoFechada =
    dados.status_cotacao === 'rascunho' ? 'Esta cotação ainda não foi liberada pelo comprador. Tente novamente mais tarde.'
    : dados.status_cotacao === 'enviada' ? MENSAGENS.PRAZO_ENCERRADO
    : MENSAGENS.COTACAO_FECHADA

  return (
    <Casca>
      {/* Quem está cotando */}
      <div className="card resp-empresa">
        <div className="resp-avatar">{(empresa.nome || '?').trim().charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="texto-suave" style={{ fontSize: 13 }}>Pedido de cotação de</div>
          <h2>{empresa.nome}</h2>
          {empresa.razao_social && empresa.razao_social !== empresa.nome && (
            <div className="texto-suave" style={{ fontSize: 13 }}>{empresa.razao_social}</div>
          )}
          <div className="resp-meta">
            {empresa.cnpj && <span className="mono">CNPJ {empresa.cnpj}</span>}
            {local && <span>{local}</span>}
            {empresa.telefone && <span>{empresa.telefone}</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mono texto-suave" style={{ fontSize: 12 }}>{numeroCotacao(cotacao.numero)}</div>
        <h1 style={{ fontSize: 22, margin: '2px 0 8px' }}>{cotacao.titulo}</h1>
        <div className="resp-meta">
          <span>Para: <strong>{fornecedor.nome}</strong></span>
          {cotacao.prazo_resposta && <span>Responder até: <strong>{formatarData(cotacao.prazo_resposta)}</strong></span>}
        </div>
        {cotacao.observacoes && (
          <div className="alerta alerta-info" style={{ margin: '14px 0 0', whiteSpace: 'pre-wrap' }}>{cotacao.observacoes}</div>
        )}
      </div>

      {somenteLeitura && <div className="alerta alerta-erro">{motivoFechada}</div>}
      {!somenteLeitura && dados.ja_respondido && (
        <div className="alerta alerta-ok">
          Você já enviou preços para esta cotação. Pode corrigir e enviar de novo até o prazo — vale a última versão.
        </div>
      )}

      {/* Itens */}
      <div className="card">
        <div className="secao-topo" style={{ marginBottom: 6 }}>
          <h3>Informe o preço unitário</h3>
          <span className="texto-suave" style={{ fontSize: 13 }}>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
        </div>

        <div className="resp-cab">
          <span>Produto</span><span className="num">Qtd</span><span className="num">Preço unit. (R$)</span>
          <span className="num">Subtotal</span><span />
        </div>

        {itens.map((i, n) => {
          const r = resp[i.id] || {}
          const p = parseNumero(r.preco)
          const sub = !r.semItem && Number.isFinite(p) ? p * Number(i.quantidade) : null
          return (
            <div key={i.id} className={`resp-item ${r.semItem ? 'sem' : ''}`}>
              <div className="resp-prod">
                <span className="mono resp-n">{n + 1}</span>
                <div>
                  <div className="resp-nome">{i.produto}</div>
                  {i.observacao && <div className="resp-obs">{i.observacao}</div>}
                </div>
              </div>
              <div className="resp-qtd num">
                <span className="rot">Qtd</span>{formatarQtd(i.quantidade)} <small>{i.unidade}</small>
              </div>
              <div className="resp-preco">
                <span className="rot">Preço unit. (R$)</span>
                <input className="input" inputMode="decimal" placeholder={r.semItem ? '—' : '0,00'}
                  value={r.semItem ? '' : r.preco} disabled={somenteLeitura || r.semItem}
                  onChange={(e) => alterar(i.id, 'preco', e.target.value)}
                  onBlur={() => formatarAoSair(i.id)} />
              </div>
              <div className="resp-sub num">
                <span className="rot">Subtotal</span>{sub != null ? formatarMoeda(sub) : '—'}
              </div>
              <label className="resp-nao">
                <input type="checkbox" checked={!!r.semItem} disabled={somenteLeitura}
                  onChange={(e) => alterar(i.id, 'semItem', e.target.checked)} />
                Não tenho
              </label>
            </div>
          )
        })}
      </div>

      {/* Condições */}
      <div className="card">
        <h3 style={{ marginBottom: 14 }}>Condições <span className="texto-suave" style={{ fontWeight: 400, fontSize: 13 }}>(opcional)</span></h3>
        <div className="linha-campos">
          <div className="campo">
            <label>Prazo de entrega (dias)</label>
            <input className="input" inputMode="numeric" value={cond.prazo} disabled={somenteLeitura}
              onChange={(e) => setCond({ ...cond, prazo: e.target.value.replace(/\D/g, '') })} placeholder="Ex.: 5" />
          </div>
          <div className="campo">
            <label>Frete (R$)</label>
            <input className="input" inputMode="decimal" value={cond.frete} disabled={somenteLeitura}
              onChange={(e) => setCond({ ...cond, frete: e.target.value })} placeholder="0,00 = grátis" />
          </div>
        </div>
        <div className="campo">
          <label>Condição de pagamento</label>
          <input className="input" value={cond.pagamento} disabled={somenteLeitura}
            onChange={(e) => setCond({ ...cond, pagamento: e.target.value })} placeholder="Ex.: 28 dias boleto, à vista 3% desc." />
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label>Observações</label>
          <textarea className="textarea" value={cond.obs} disabled={somenteLeitura}
            onChange={(e) => setCond({ ...cond, obs: e.target.value })} placeholder="Validade da proposta, marcas, etc." />
        </div>
      </div>

      {/* Total + enviar */}
      {!somenteLeitura && (
        <div className="resp-rodape">
          <div className="resp-rodape-inner">
            <div>
              <div className="texto-suave" style={{ fontSize: 13 }}>
                Total {totais.cotados}/{itens.length} itens{parseNumero(cond.frete) > 0 ? ' + frete' : ''}
              </div>
              <div className="resp-total">{formatarMoeda(totais.total)}</div>
            </div>
            <button className="btn btn-primario" onClick={enviar} disabled={enviando}>
              {enviando ? 'Enviando...' : dados.ja_respondido ? 'Atualizar cotação' : 'Enviar cotação'}
            </button>
          </div>
          {erroEnvio && <div className="alerta alerta-erro" style={{ margin: '10px auto 0', maxWidth: 820 }}>{erroEnvio}</div>}
        </div>
      )}
    </Casca>
  )
}

function Casca({ children }) {
  return (
    <div className="resp-pagina">
      <div className="auth-topo"><Logo to={null} /></div>
      <main className="resp-corpo">{children}</main>
      <footer className="resp-assinatura">
        Cotação enviada pelo <strong>CotaCompara</strong> — você não precisa de cadastro para responder.
      </footer>
    </div>
  )
}
