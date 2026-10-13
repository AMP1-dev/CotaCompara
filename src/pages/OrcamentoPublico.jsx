import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase, mensagemErro } from '../lib/supabase'
import { numeroCotacao, formatarData, formatarMoeda, formatarQtd, linkWhatsApp } from '../lib/format'
import Logo from '../components/Logo'
import Modal from '../components/Modal'
import Carregando from '../components/Carregando'

// A4 retrato com margem de 10 mm, em px CSS
const LARGURA = Math.floor((210 - 20) * 3.7795) // 718
const ALTURA = Math.floor((297 - 20) * 3.7795) - 12 // 1034
const ZOOM_MIN = 0.6

function ajustar(folha) {
  if (!folha) return
  document.body.classList.add('modo-impressao-orc')
  folha.style.zoom = ''
  const alt = (z) => { folha.style.width = `${LARGURA / z}px`; return folha.scrollHeight * z }
  let z = 1
  if (alt(1) > ALTURA) {
    let lo = ZOOM_MIN, hi = 1
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (alt(m) <= ALTURA) lo = m; else hi = m }
    z = lo
  }
  folha.style.width = `${LARGURA / z}px`; folha.style.zoom = String(z)
}
function restaurar(folha) {
  document.body.classList.remove('modo-impressao-orc')
  if (folha) { folha.style.zoom = ''; folha.style.width = '' }
}

// Orçamento que o fornecedor enviou — o cliente abre sem login, baixa em PDF e aprova
export default function OrcamentoPublico() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const folhaRef = useRef(null)
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [aprovarAberto, setAprovarAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroAprovar, setErroAprovar] = useState('')

  const carregar = async () => {
    const { data, error } = await supabase.rpc('orcamento_publico', { p_token: token })
    if (error) setErro(mensagemErro(error)); else setDados(data)
  }
  useEffect(() => {
    const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    carregar()
    return () => meta.remove()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dados) return
    document.title = `Orçamento ${numeroCotacao(dados.orcamento.numero)} · ${dados.empresa.nome}`
    const antes = () => ajustar(folhaRef.current)
    const depois = () => restaurar(folhaRef.current)
    window.addEventListener('beforeprint', antes)
    window.addEventListener('afterprint', depois)
    if (params.get('imprimir')) setTimeout(imprimir, 600)
    return () => { window.removeEventListener('beforeprint', antes); window.removeEventListener('afterprint', depois) }
  }, [dados]) // eslint-disable-line react-hooks/exhaustive-deps

  const imprimir = () => {
    ajustar(folhaRef.current)
    requestAnimationFrame(() => setTimeout(() => window.print(), 50))
  }

  const aprovar = async () => {
    setErroAprovar('')
    if (!nome.trim()) return setErroAprovar('Informe seu nome.')
    setEnviando(true)
    const { error } = await supabase.rpc('aprovar_orcamento', { p_token: token, p_nome: nome.trim() })
    setEnviando(false)
    if (error) return setErroAprovar(mensagemErro(error))
    setAprovarAberto(false)
    carregar()
  }

  if (erro) return (
    <div className="orc-pub-erro">
      <Logo to={null} />
      <div className="card" style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Não foi possível abrir</h2>
        <p className="texto-suave">{erro}</p>
      </div>
    </div>
  )
  if (!dados) return <Carregando />

  const { empresa: e, orcamento: o, itens } = dados
  const vencido = o.valido_ate && new Date(o.valido_ate) < new Date()
  const local = [e.cidade, e.uf].filter(Boolean).join(' / ')
  const whatsFornecedor = linkWhatsApp(e.telefone, `Olá! Sobre o orçamento ${numeroCotacao(o.numero)}${o.cliente_nome ? ` (${o.cliente_nome})` : ''}:`)
  const podeAprovar = o.status === 'enviado' && !vencido && !dados.sou_dono
  const semPreco = itens.filter((i) => i.preco_unitario == null).length

  return (
    <div className="orc-pub">
      {/* orçamento imprime em A4 retrato (o mapa de cotação usa paisagem) */}
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm; } }'}</style>
      <div className="orc-pub-barra no-print">
        <div className="orc-pub-barra-in">
          <span className="texto-suave" style={{ fontSize: 13 }}>Orçamento de <b>{e.nome}</b></span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secundario btn-pequeno" onClick={imprimir}>Baixar PDF / Imprimir</button>
            {whatsFornecedor && <a className="btn btn-secundario btn-pequeno" href={whatsFornecedor} target="_blank" rel="noreferrer">Falar no WhatsApp</a>}
            {podeAprovar && <button className="btn btn-verde btn-pequeno" onClick={() => setAprovarAberto(true)}>Aprovar orçamento</button>}
          </div>
        </div>
      </div>

      {o.status === 'aprovado' && (
        <div className="alerta alerta-ok no-print orc-pub-aviso">✅ Orçamento aprovado{o.aprovado_por ? ` por ${o.aprovado_por}` : ''} em {formatarData(o.aprovado_em)}. O fornecedor vê a aprovação no painel dele.</div>
      )}
      {vencido && o.status !== 'aprovado' && (
        <div className="alerta alerta-info no-print orc-pub-aviso">A validade deste orçamento terminou em {formatarData(o.valido_ate, false)}. Peça uma atualização ao fornecedor.</div>
      )}

      <div className="orc-folha" ref={folhaRef}>
        <header className="orc-f-cab">
          <div className="orc-f-emp">
            {e.logo_url && <img src={e.logo_url} alt="" className="orc-f-logo" />}
            <div>
              <div className="orc-f-nome">{e.nome}</div>
              {e.razao_social && e.razao_social !== e.nome && <div>{e.razao_social}</div>}
              {e.cnpj && <div className="mono">CNPJ {e.cnpj}</div>}
              {(e.endereco || local) && <div>{[e.endereco, local, e.cep && `CEP ${e.cep}`].filter(Boolean).join(' · ')}</div>}
              {(e.telefone || e.email) && <div>{[e.telefone, e.email].filter(Boolean).join(' · ')}</div>}
            </div>
          </div>
          <div className="orc-f-doc">
            <div className="orc-f-tipo">Orçamento</div>
            <div className="orc-f-num mono">{numeroCotacao(o.numero)}</div>
            <div>Data: {formatarData(o.enviado_em || o.criado_em, false)}</div>
            <div>Válido até: <b>{formatarData(o.valido_ate, false)}</b></div>
          </div>
        </header>

        {(o.cliente_nome || o.referencia) && (
          <section className="orc-f-cliente">
            {o.cliente_nome && <div><span>Cliente</span><b>{o.cliente_nome}</b>{o.cliente_documento && <small className="mono"> · {o.cliente_documento}</small>}</div>}
            {o.referencia && <div><span>Referência</span><b>{o.referencia}</b></div>}
          </section>
        )}

        <table className="orc-f-tabela">
          <thead>
            <tr><th style={{ width: 30 }}>#</th><th>Produto</th><th className="num">Qtd</th><th>Un.</th><th className="num">Preço unit.</th><th className="num">Subtotal</th></tr>
          </thead>
          <tbody>
            {itens.map((i, n) => (
              <tr key={n} className={i.preco_unitario == null ? 'sem' : ''}>
                <td>{n + 1}</td>
                <td>{i.produto}{i.observacao && <div className="orc-f-obs">{i.observacao}</div>}</td>
                <td className="num">{formatarQtd(i.quantidade)}</td>
                <td>{i.unidade}</td>
                <td className="num">{i.preco_unitario == null ? 'não disponível' : formatarMoeda(i.preco_unitario)}</td>
                <td className="num">{i.subtotal == null ? '—' : formatarMoeda(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="orc-f-rodape">
          <div className="orc-f-cond">
            {o.prazo_entrega && <div><span>Prazo de entrega</span>{o.prazo_entrega}</div>}
            {o.condicao_pagamento && <div><span>Pagamento</span>{o.condicao_pagamento}</div>}
            <div><span>Validade</span>{o.validade_dias} dias</div>
            {o.observacoes && <div className="obs"><span>Observações</span>{o.observacoes}</div>}
            {semPreco > 0 && <div className="obs"><span>Atenção</span>{semPreco} {semPreco === 1 ? 'item não está disponível' : 'itens não estão disponíveis'} no momento.</div>}
          </div>
          <div className="orc-f-totais">
            <div><span>Subtotal</span>{formatarMoeda(o.subtotal)}</div>
            {Number(o.desconto) > 0 && <div><span>Desconto</span>− {formatarMoeda(o.desconto)}</div>}
            {o.frete != null && <div><span>Frete</span>{Number(o.frete) ? formatarMoeda(o.frete) : 'grátis'}</div>}
            <div className="total"><span>Total</span>{formatarMoeda(o.total)}</div>
          </div>
        </div>

        {o.status === 'aprovado' && (
          <div className="orc-f-aprovado">Aprovado por {o.aprovado_por} em {formatarData(o.aprovado_em)}</div>
        )}
        <div className="orc-f-assinatura">
          <div><div className="linha" />{e.responsavel ? `${e.responsavel} — ${e.nome}` : e.nome}</div>
          <div><div className="linha" />De acordo (cliente)</div>
        </div>
        <div className="orc-f-marca">Orçamento gerado no CotaCompara · cotacompara.amp.ia.br</div>
      </div>

      <div className="orc-pub-cta no-print">
        <Logo to={null} />
        <div>
          <b>Também compra para a sua empresa ou instituição?</b>
          <span>Mande a lista para vários fornecedores e veja o menor preço de cada item em um só lugar.</span>
        </div>
        <a className="btn btn-primario btn-pequeno" href="/cadastro">Conhecer o CotaCompara</a>
      </div>

      <Modal aberto={aprovarAberto} titulo="Aprovar orçamento" onFechar={() => setAprovarAberto(false)}
        rodape={<>
          <button className="btn btn-secundario" onClick={() => setAprovarAberto(false)}>Cancelar</button>
          <button className="btn btn-verde" onClick={aprovar} disabled={enviando}>{enviando ? 'Enviando...' : 'Confirmar aprovação'}</button>
        </>}>
        <p style={{ marginTop: 0 }}>
          Você está aprovando o orçamento {numeroCotacao(o.numero)} de <b>{e.nome}</b> no valor de <b>{formatarMoeda(o.total)}</b>.
          O fornecedor vê a aprovação no painel dele na hora.
        </p>
        {erroAprovar && <div className="alerta alerta-erro">{erroAprovar}</div>}
        <div className="campo" style={{ marginBottom: 0 }}>
          <label>Seu nome</label>
          <input className="input" autoFocus value={nome} onChange={(ev) => setNome(ev.target.value)} placeholder="Nome de quem está aprovando" />
        </div>
      </Modal>
    </div>
  )
}
