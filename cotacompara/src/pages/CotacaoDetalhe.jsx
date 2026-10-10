import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, SCHEMA, APP_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  STATUS_COTACAO, STATUS_CONVITE, numeroCotacao, formatarData, formatarQtd, linkWhatsApp, copiarTexto,
} from '../lib/format'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import { IconeEditar, IconeLixo, IconeLink, IconeVoltar, IconeWhats } from '../components/Icones'

export default function CotacaoDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { empresa } = useAuth()

  const [cotacao, setCotacao] = useState(null)
  const [itens, setItens] = useState([])
  const [convites, setConvites] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(null)

  // modal de adicionar fornecedores
  const [modalForn, setModalForn] = useState(false)
  const [agenda, setAgenda] = useState([])
  const [selecionados, setSelecionados] = useState(new Set())

  const carregarConvites = useCallback(async () => {
    const { data } = await supabase
      .from('convites')
      .select('id, token, status, enviado_em, aberto_em, respondido_em, fornecedor:fornecedores(id, nome, contato, email, whatsapp)')
      .eq('cotacao_id', id)
      .order('created_at')
    setConvites(data || [])
  }, [id])

  const carregar = useCallback(async () => {
    const { data: c, error } = await supabase
      .from('cotacoes')
      .select('*, cotacao_itens(*)')
      .eq('id', id)
      .maybeSingle()
    if (error || !c) { setErro('Cotação não encontrada.'); setCarregando(false); return }
    setCotacao(c)
    setItens((c.cotacao_itens || []).sort((a, b) => a.ordem - b.ordem))
    await carregarConvites()
    setCarregando(false)
  }, [id, carregarConvites])

  useEffect(() => { carregar() }, [carregar])

  // atualiza ao vivo quando o fornecedor abre/responde
  useEffect(() => {
    const canal = supabase
      .channel(`convites-${id}`)
      .on('postgres_changes',
        { event: '*', schema: SCHEMA, table: 'convites', filter: `cotacao_id=eq.${id}` },
        () => carregarConvites())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [id, carregarConvites])

  const resumo = useMemo(() => {
    const r = { total: convites.length, respondido: 0, aberto: 0, enviado: 0, pendente: 0 }
    convites.forEach((c) => { r[c.status] = (r[c.status] || 0) + 1 })
    return r
  }, [convites])

  if (carregando) return <div className="card">Carregando...</div>
  if (!cotacao) return <div className="card"><div className="alerta alerta-erro">{erro}</div><Link to="/cotacoes">Voltar</Link></div>

  const st = STATUS_COTACAO[cotacao.status]
  const rascunho = cotacao.status === 'rascunho'
  const aberta = cotacao.status === 'enviada'
  const vencida = aberta && cotacao.prazo_resposta && new Date(cotacao.prazo_resposta) < new Date()
  const linkDe = (c) => `${APP_URL}/r/${c.token}`

  /* ---------- ações da cotação ---------- */
  const mudarStatus = async (status, confirmacao) => {
    if (confirmacao && !window.confirm(confirmacao)) return
    setOcupado(true)
    const { error } = await supabase.from('cotacoes').update({ status }).eq('id', id)
    setOcupado(false)
    if (error) return setErro(error.message)
    setCotacao({ ...cotacao, status })
  }

  const liberar = () => {
    setErro('')
    if (!itens.length) return setErro('A cotação não tem itens.')
    if (!convites.length) return setErro('Adicione pelo menos um fornecedor antes de liberar.')
    if (cotacao.prazo_resposta && new Date(cotacao.prazo_resposta) < new Date())
      return setErro('O prazo de resposta já passou. Edite a cotação e ajuste o prazo.')
    mudarStatus('enviada',
      'Liberar a cotação para respostas?\n\nDepois disso os itens não podem mais ser alterados. ' +
      'Você poderá copiar o link de cada fornecedor ou enviar pelo WhatsApp.')
  }

  const excluir = async () => {
    if (!window.confirm('Excluir esta cotação? Essa ação não pode ser desfeita.')) return
    const { error } = await supabase.from('cotacoes').delete().eq('id', id)
    if (error) return setErro(error.message)
    navigate('/cotacoes', { replace: true })
  }

  /* ---------- fornecedores ---------- */
  const abrirModalForn = async () => {
    const { data } = await supabase.from('fornecedores').select('id, nome, contato, email').eq('ativo', true).order('nome')
    const jaConvidados = new Set(convites.map((c) => c.fornecedor?.id))
    setAgenda((data || []).filter((f) => !jaConvidados.has(f.id)))
    setSelecionados(new Set())
    setModalForn(true)
  }

  const alternarSel = (fid) => {
    const s = new Set(selecionados)
    s.has(fid) ? s.delete(fid) : s.add(fid)
    setSelecionados(s)
  }

  const convidar = async () => {
    if (!selecionados.size) return
    setOcupado(true)
    const linhas = [...selecionados].map((fornecedor_id) => ({ cotacao_id: id, fornecedor_id }))
    const { error } = await supabase
      .from('convites')
      .upsert(linhas, { onConflict: 'cotacao_id,fornecedor_id', ignoreDuplicates: true })
    setOcupado(false)
    if (error) return setErro(error.message)
    setModalForn(false)
    carregarConvites()
  }

  const removerConvite = async (c) => {
    if (!window.confirm(`Remover ${c.fornecedor?.nome} desta cotação?`)) return
    await supabase.from('convites').delete().eq('id', c.id)
    carregarConvites()
  }

  const marcarEnviado = async (c) => {
    if (c.status !== 'pendente') return
    await supabase.from('convites').update({ status: 'enviado', enviado_em: new Date().toISOString() }).eq('id', c.id)
    carregarConvites()
  }

  const copiarLink = async (c) => {
    await copiarTexto(linkDe(c))
    setCopiado(c.id)
    setTimeout(() => setCopiado(null), 2000)
    marcarEnviado(c)
  }

  const textoWhats = (c) => {
    const prazo = cotacao.prazo_resposta ? `\nPrazo para resposta: ${formatarData(cotacao.prazo_resposta)}` : ''
    return `Olá ${c.fornecedor?.contato || c.fornecedor?.nome}! Aqui é da ${empresa?.nome}.\n` +
      `Estamos cotando: *${cotacao.titulo}* (${itens.length} ${itens.length === 1 ? 'item' : 'itens'}).${prazo}\n\n` +
      `É só abrir o link e preencher os preços, sem cadastro:\n${linkDe(c)}`
  }

  return (
    <>
      <Link to="/cotacoes" className="voltar"><IconeVoltar /> Cotações</Link>

      {erro && <div className="alerta alerta-erro">{erro}</div>}

      {/* ---------- Cabeçalho ---------- */}
      <div className="card">
        <div className="cab-cotacao">
          <div>
            <div className="num">{numeroCotacao(cotacao.numero)}</div>
            <h1 style={{ margin: '2px 0 6px' }}>{cotacao.titulo}</h1>
            {vencida ? <Badge cor="laranja">prazo vencido</Badge> : <Badge cor={st.cor}>{st.rotulo}</Badge>}
            <div className="info">
              <span>Criada em {formatarData(cotacao.created_at, false)}</span>
              <span>Prazo: <strong>{formatarData(cotacao.prazo_resposta)}</strong></span>
              <span>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
            </div>
          </div>
          <div className="acoes-topo">
            {(rascunho || aberta) && (
              <Link to={`/cotacoes/${id}/editar`} className="btn btn-secundario btn-pequeno">
                <IconeEditar /> Editar
              </Link>
            )}
            {rascunho && (
              <>
                <button className="btn btn-perigo btn-pequeno" onClick={excluir}>Excluir</button>
                <button className="btn btn-primario btn-pequeno" onClick={liberar} disabled={ocupado}>
                  Liberar para respostas
                </button>
              </>
            )}
            {aberta && (
              <button className="btn btn-verde btn-pequeno" disabled={ocupado}
                onClick={() => mudarStatus('encerrada', 'Encerrar a cotação? Os fornecedores não poderão mais enviar preços.')}>
                Encerrar cotação
              </button>
            )}
            {cotacao.status === 'encerrada' && (
              <button className="btn btn-secundario btn-pequeno" disabled={ocupado}
                onClick={() => mudarStatus('enviada', 'Reabrir a cotação para novas respostas?')}>
                Reabrir
              </button>
            )}
          </div>
        </div>
        {cotacao.observacoes && (
          <div className="alerta alerta-info" style={{ marginTop: 16, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
            {cotacao.observacoes}
          </div>
        )}
      </div>

      {/* ---------- Resumo ---------- */}
      {convites.length > 0 && (
        <div className="grid grid-4" style={{ marginTop: 16 }}>
          <div className="card stat destaque"><div className="rotulo">Convidados</div><div className="valor">{resumo.total}</div></div>
          <div className="card stat verde"><div className="rotulo">Responderam</div><div className="valor">{resumo.respondido || 0}</div></div>
          <div className="card stat laranja"><div className="rotulo">Visualizaram</div><div className="valor">{resumo.aberto || 0}</div></div>
          <div className="card stat amarelo"><div className="rotulo">Não abriram</div><div className="valor">{(resumo.enviado || 0) + (resumo.pendente || 0)}</div></div>
        </div>
      )}

      {/* ---------- Fornecedores ---------- */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="secao-topo">
          <div>
            <h3>Fornecedores</h3>
            {rascunho && convites.length > 0 && (
              <div className="texto-suave">Os links funcionam depois que você clicar em <strong>Liberar para respostas</strong>.</div>
            )}
          </div>
          {cotacao.status !== 'cancelada' && (
            <button className="btn btn-secundario btn-pequeno" onClick={abrirModalForn}>+ Adicionar fornecedores</button>
          )}
        </div>

        {convites.length === 0 ? (
          <div className="vazio" style={{ padding: '24px 12px' }}>
            <p style={{ margin: '0 auto 16px' }}>Escolha da sua agenda quem vai receber esta cotação.</p>
            <button className="btn btn-primario" onClick={abrirModalForn}>Escolher fornecedores</button>
          </div>
        ) : (
          <div className="lista" style={{ boxShadow: 'none', border: '1px solid var(--borda)' }}>
            {convites.map((c) => {
              const sc = STATUS_CONVITE[c.status] || STATUS_CONVITE.pendente
              const zap = linkWhatsApp(c.fornecedor?.whatsapp, textoWhats(c))
              const quando = c.respondido_em ? `respondeu ${formatarData(c.respondido_em)}`
                : c.aberto_em ? `abriu ${formatarData(c.aberto_em)}`
                : c.enviado_em ? `enviado ${formatarData(c.enviado_em)}` : null
              return (
                <div key={c.id} className="lista-item">
                  <div className="principal">
                    <div className="titulo">{c.fornecedor?.nome}</div>
                    <div className="meta">
                      <span>{c.fornecedor?.email}</span>
                      {quando && <span>{quando}</span>}
                    </div>
                  </div>
                  {copiado === c.id && <span className="copiado">Link copiado!</span>}
                  <Badge cor={sc.cor}>{sc.rotulo}</Badge>
                  <div className="acoes">
                    {aberta && (
                      <>
                        <button className="btn-icone" title="Copiar link" onClick={() => copiarLink(c)}><IconeLink /></button>
                        {zap && (
                          <a className="btn-icone whats" title="Enviar pelo WhatsApp" href={zap} target="_blank"
                            rel="noreferrer" onClick={() => marcarEnviado(c)}>
                            <IconeWhats />
                          </a>
                        )}
                      </>
                    )}
                    {c.status !== 'respondido' && (
                      <button className="btn-icone perigo" title="Remover da cotação" onClick={() => removerConvite(c)}>
                        <IconeLixo />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ---------- Itens ---------- */}
      <div className="card">
        <div className="secao-topo"><h3>Itens</h3></div>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th style={{ width: 40 }}>#</th><th>Produto</th><th className="num">Qtd</th><th>Unid.</th><th>Observação</th></tr>
            </thead>
            <tbody>
              {itens.map((i, n) => (
                <tr key={i.id}>
                  <td className="mono" style={{ color: 'var(--texto-3)' }}>{n + 1}</td>
                  <td>{i.produto}</td>
                  <td className="num">{formatarQtd(i.quantidade)}</td>
                  <td>{i.unidade}</td>
                  <td style={{ color: 'var(--texto-2)' }}>{i.observacao || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {resumo.respondido > 0 && (
        <div className="card">
          <div className="alerta alerta-ok" style={{ margin: 0 }}>
            {resumo.respondido} {resumo.respondido === 1 ? 'fornecedor respondeu' : 'fornecedores responderam'}.
            O mapa comparativo (menor preço por item e no total) chega na fase 5.
          </div>
        </div>
      )}

      {/* ---------- Modal: adicionar fornecedores ---------- */}
      <Modal
        aberto={modalForn}
        titulo="Adicionar fornecedores"
        onFechar={() => setModalForn(false)}
        rodape={
          <>
            <button className="btn btn-secundario" onClick={() => setModalForn(false)}>Cancelar</button>
            <button className="btn btn-primario" onClick={convidar} disabled={!selecionados.size || ocupado}>
              Adicionar {selecionados.size || ''}
            </button>
          </>
        }
      >
        {agenda.length === 0 ? (
          <div className="texto-suave">
            Todos os fornecedores ativos já estão nesta cotação, ou sua agenda está vazia.{' '}
            <Link to="/fornecedores">Cadastrar fornecedores</Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="texto-suave">{agenda.length} disponíveis</span>
              <button className="btn btn-texto btn-pequeno" onClick={() =>
                setSelecionados(selecionados.size === agenda.length ? new Set() : new Set(agenda.map((f) => f.id)))}>
                {selecionados.size === agenda.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <div className="checklist">
              {agenda.map((f) => (
                <label key={f.id}>
                  <input type="checkbox" checked={selecionados.has(f.id)} onChange={() => alternarSel(f.id)} />
                  <span>{f.nome}<small>{f.email}</small></span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12 }}><Link to="/fornecedores" className="texto-suave">+ Cadastrar outro fornecedor</Link></div>
          </>
        )}
      </Modal>
    </>
  )
}
