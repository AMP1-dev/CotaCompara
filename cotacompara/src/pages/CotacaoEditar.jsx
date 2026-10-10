import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  UNIDADES, formatarQtd, parseNumero, paraInputLocal, deInputLocal, prazoPadrao, numeroCotacao,
} from '../lib/format'
import Modal from '../components/Modal'
import { IconeLixo, IconeVoltar } from '../components/Icones'

let seq = 0
const novoItem = (dados = {}) => ({
  key: ++seq, produto: '', unidade: 'UN', quantidade: '', observacao: '', ...dados,
})

export default function CotacaoEditar() {
  const { id } = useParams()
  const editando = !!id
  const navigate = useNavigate()
  const { empresa } = useAuth()

  const [numero, setNumero] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [prazo, setPrazo] = useState(paraInputLocal(prazoPadrao()))
  const [observacoes, setObservacoes] = useState('')
  const [itens, setItens] = useState([novoItem(), novoItem(), novoItem()])
  const [carregando, setCarregando] = useState(editando)
  const [bloqueada, setBloqueada] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [colarAberto, setColarAberto] = useState(false)
  const [textoColado, setTextoColado] = useState('')
  const ultimoProduto = useRef(null)

  useEffect(() => {
    if (!editando) return
    ;(async () => {
      const { data: c, error } = await supabase
        .from('cotacoes')
        .select('*, cotacao_itens(*)')
        .eq('id', id)
        .maybeSingle()
      if (error || !c) { setErro('Cotação não encontrada.'); setCarregando(false); return }
      setNumero(c.numero)
      setTitulo(c.titulo)
      setPrazo(paraInputLocal(c.prazo_resposta))
      setObservacoes(c.observacoes || '')
      const its = (c.cotacao_itens || []).sort((a, b) => a.ordem - b.ordem)
      setItens(its.length
        ? its.map((i) => novoItem({ produto: i.produto, unidade: i.unidade, quantidade: formatarQtd(i.quantidade), observacao: i.observacao || '' }))
        : [novoItem()])
      setBloqueada(c.status !== 'rascunho')
      setCarregando(false)
    })()
  }, [editando, id])

  const alterarItem = (key, campo, valor) =>
    setItens((lista) => lista.map((i) => (i.key === key ? { ...i, [campo]: valor } : i)))

  const adicionarItem = () => {
    setItens((lista) => [...lista, novoItem()])
    setTimeout(() => ultimoProduto.current?.focus(), 0)
  }

  const removerItem = (key) =>
    setItens((lista) => (lista.length > 1 ? lista.filter((i) => i.key !== key) : [novoItem()]))

  // Enter no último campo de quantidade cria nova linha
  const teclaQtd = (e, idx) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (idx === itens.length - 1) adicionarItem()
    }
  }

  // Colar do Excel: produto [TAB] quantidade [TAB] unidade
  const importarColado = () => {
    const linhas = textoColado.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const novos = []
    for (const linha of linhas) {
      const partes = linha.includes('\t') ? linha.split('\t') : linha.split(/;/)
      const produto = (partes[0] || '').trim()
      if (!produto) continue
      const qtd = parseNumero(partes[1])
      const un = (partes[2] || '').trim().toUpperCase()
      novos.push(novoItem({
        produto,
        quantidade: Number.isFinite(qtd) && qtd > 0 ? formatarQtd(qtd) : '',
        unidade: un ? (UNIDADES.includes(un) ? un : un.slice(0, 6)) : 'UN',
      }))
    }
    if (!novos.length) return
    setItens((lista) => [...lista.filter((i) => i.produto.trim()), ...novos])
    setTextoColado('')
    setColarAberto(false)
  }

  const salvar = async () => {
    setErro('')
    if (!titulo.trim()) return setErro('Dê um título para a cotação (ex.: "Material de limpeza — novembro").')

    const preenchidos = itens.filter((i) => i.produto.trim())
    if (!preenchidos.length) return setErro('Adicione pelo menos um produto.')
    for (const [n, i] of preenchidos.entries()) {
      const q = parseNumero(i.quantidade)
      if (!Number.isFinite(q) || q <= 0) return setErro(`Informe a quantidade do item ${n + 1} (${i.produto}).`)
    }

    const dados = {
      titulo: titulo.trim(),
      prazo_resposta: deInputLocal(prazo),
      observacoes: observacoes.trim() || null,
    }

    setSalvando(true)
    let cotacaoId = id

    if (editando) {
      const { error } = await supabase.from('cotacoes').update(dados).eq('id', id)
      if (error) { setSalvando(false); return setErro('Erro ao salvar: ' + error.message) }
      if (!bloqueada) {
        const { error: e2 } = await supabase.from('cotacao_itens').delete().eq('cotacao_id', id)
        if (e2) { setSalvando(false); return setErro('Erro ao atualizar itens: ' + e2.message) }
      }
    } else {
      const { data, error } = await supabase
        .from('cotacoes')
        .insert({ ...dados, empresa_id: empresa.id, status: 'rascunho' })
        .select('id')
        .single()
      if (error) { setSalvando(false); return setErro('Erro ao criar: ' + error.message) }
      cotacaoId = data.id
    }

    if (!bloqueada) {
      const linhas = preenchidos.map((i, ordem) => ({
        cotacao_id: cotacaoId,
        ordem,
        produto: i.produto.trim(),
        unidade: i.unidade || 'UN',
        quantidade: parseNumero(i.quantidade),
        observacao: i.observacao.trim() || null,
      }))
      const { error } = await supabase.from('cotacao_itens').insert(linhas)
      if (error) { setSalvando(false); return setErro('Erro ao salvar itens: ' + error.message) }
    }

    setSalvando(false)
    navigate(`/cotacoes/${cotacaoId}`, { replace: true })
  }

  if (carregando) return <div className="card">Carregando...</div>

  const qtdPreenchidos = itens.filter((i) => i.produto.trim()).length

  return (
    <>
      <Link to={editando ? `/cotacoes/${id}` : '/cotacoes'} className="voltar"><IconeVoltar /> Voltar</Link>

      <div className="titulo-pagina">
        <div>
          <h1>{editando ? 'Editar cotação' : 'Nova cotação'}</h1>
          {numero && <div className="subtitulo mono">{numeroCotacao(numero)}</div>}
        </div>
      </div>

      {erro && <div className="alerta alerta-erro">{erro}</div>}
      {bloqueada && (
        <div className="alerta alerta-info">
          Esta cotação já foi liberada para os fornecedores, então os itens não podem mais ser alterados.
          Você ainda pode mudar o título, o prazo e as observações.
        </div>
      )}

      <div className="card">
        <div className="linha-campos">
          <div className="campo">
            <label>Título *</label>
            <input className="input" autoFocus={!editando} value={titulo} onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Material de limpeza — novembro" />
          </div>
          <div className="campo">
            <label>Prazo para resposta</label>
            <input className="input" type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            <small>Depois desse horário o link para de aceitar preços.</small>
          </div>
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label>Observações para o fornecedor</label>
          <textarea className="textarea" value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex.: entrega no endereço X, pagamento em 28 dias, marca de preferência..." />
        </div>
      </div>

      <div className="card">
        <div className="secao-topo">
          <h3>Itens ({qtdPreenchidos})</h3>
          {!bloqueada && (
            <button className="btn btn-secundario btn-pequeno" onClick={() => setColarAberto(true)}>
              Colar do Excel
            </button>
          )}
        </div>

        <div className="itens-cab">
          <span>#</span><span>Produto</span><span style={{ textAlign: 'right' }}>Quantidade</span>
          <span>Unid.</span><span>Observação</span><span />
        </div>

        {itens.map((i, idx) => (
          <div key={i.key} className="item-linha">
            <span className="n">{idx + 1}</span>
            <div className="c-prod">
              <input className="input" placeholder="Produto, marca, especificação" value={i.produto} disabled={bloqueada}
                ref={idx === itens.length - 1 ? ultimoProduto : null}
                onChange={(e) => alterarItem(i.key, 'produto', e.target.value)} />
            </div>
            <div className="c-qtd">
              <input className="input qtd" inputMode="decimal" placeholder="Qtd" value={i.quantidade} disabled={bloqueada}
                onChange={(e) => alterarItem(i.key, 'quantidade', e.target.value)}
                onKeyDown={(e) => teclaQtd(e, idx)} />
            </div>
            <div className="c-un">
              <select className="select" value={i.unidade} disabled={bloqueada}
                onChange={(e) => alterarItem(i.key, 'unidade', e.target.value)}>
                {!UNIDADES.includes(i.unidade) && <option value={i.unidade}>{i.unidade}</option>}
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="c-obs">
              <input className="input" placeholder="opcional" value={i.observacao} disabled={bloqueada}
                onChange={(e) => alterarItem(i.key, 'observacao', e.target.value)} />
            </div>
            <div className="c-rm">
              <button className="btn-icone perigo" title="Remover item" disabled={bloqueada} onClick={() => removerItem(i.key)}>
                <IconeLixo />
              </button>
            </div>
          </div>
        ))}

        {!bloqueada && (
          <div className="itens-rodape">
            <button className="btn btn-texto" onClick={adicionarItem}>+ Adicionar item</button>
            <span className="texto-suave" style={{ alignSelf: 'center', fontSize: 13 }}>
              Dica: Enter na quantidade cria a próxima linha.
            </span>
          </div>
        )}
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Link to={editando ? `/cotacoes/${id}` : '/cotacoes'} className="btn btn-secundario">Cancelar</Link>
        <button className="btn btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar e escolher fornecedores'}
        </button>
      </div>

      <Modal
        aberto={colarAberto}
        titulo="Colar itens do Excel"
        onFechar={() => setColarAberto(false)}
        largura={620}
        rodape={
          <>
            <button className="btn btn-secundario" onClick={() => setColarAberto(false)}>Cancelar</button>
            <button className="btn btn-primario" onClick={importarColado} disabled={!textoColado.trim()}>Importar itens</button>
          </>
        }
      >
        <p className="texto-suave" style={{ marginTop: 0 }}>
          No Excel, selecione as colunas <strong>Produto</strong>, <strong>Quantidade</strong> e <strong>Unidade</strong>{' '}
          (nessa ordem, unidade é opcional), copie e cole aqui. Também aceita uma linha por item separada por ponto e vírgula.
        </p>
        <textarea className="textarea mono" style={{ minHeight: 200, fontSize: 13 }} autoFocus
          value={textoColado} onChange={(e) => setTextoColado(e.target.value)}
          placeholder={'Detergente neutro 500ml\t24\tUN\nPapel toalha interfolha\t10\tFD\nÁlcool 70% 1L;12;UN'} />
      </Modal>
    </>
  )
}
