import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { STATUS_COTACAO, numeroCotacao, formatarData, formatarQtd } from '../lib/format'
import { montarComparativo } from '../lib/comparativo'
import { buscarResultados } from '../lib/resultados'
import MapaComparativo, { ResumoResultado } from '../components/MapaComparativo'
import Carregando from '../components/Carregando'
import { IconeVoltar } from '../components/Icones'

// Área útil da folha A4 paisagem com margem de 8 mm, em px CSS (1 mm = 3,7795 px)
const LARGURA_UTIL = Math.floor((297 - 16) * 3.7795) // 1062
const ALTURA_UTIL = Math.floor((210 - 16) * 3.7795) - 12 // 721 (folga p/ arredondamento)
const ZOOM_MINIMO = 0.55 // abaixo disso fica ilegível: deixa quebrar em mais páginas

/**
 * Ajusta a folha para caber em UMA página A4 paisagem.
 * Com zoom z, a folha é diagramada com largura LARGURA_UTIL/z (fica mais larga,
 * as linhas quebram menos) e depois reduzida. Busca binária pelo MAIOR z em que
 * altura(z) × z cabe na página — assim o texto fica o maior possível.
 */
export function ajustarFolha(folha) {
  if (!folha) return 1
  document.body.classList.add('modo-impressao')
  folha.style.zoom = ''
  const alturaRenderizada = (z) => {
    folha.style.width = `${LARGURA_UTIL / z}px`
    return folha.scrollHeight * z
  }
  let zoom = 1
  if (alturaRenderizada(1) > ALTURA_UTIL) {
    let lo = ZOOM_MINIMO, hi = 1
    for (let i = 0; i < 12; i++) {
      const meio = (lo + hi) / 2
      if (alturaRenderizada(meio) <= ALTURA_UTIL) lo = meio
      else hi = meio
    }
    zoom = lo
  }
  // confere com a medida real já com zoom (arredondamentos podem passar alguns px)
  const aplicar = (z) => { folha.style.width = `${LARGURA_UTIL / z}px`; folha.style.zoom = String(z) }
  aplicar(zoom)
  while (zoom > ZOOM_MINIMO && folha.getBoundingClientRect().height > ALTURA_UTIL) {
    zoom = Math.max(ZOOM_MINIMO, zoom - 0.01)
    aplicar(zoom)
  }
  return zoom
}

export function restaurarFolha(folha) {
  document.body.classList.remove('modo-impressao')
  if (folha) { folha.style.zoom = ''; folha.style.width = '' }
}

// Relatório A4 (paisagem) para imprimir / salvar em PDF / exportar para Excel
export default function CotacaoImprimir() {
  const folhaRef = useRef(null)
  const { id } = useParams()
  const { empresa } = useAuth()
  const [cotacao, setCotacao] = useState(null)
  const [itens, setItens] = useState([])
  const [convidados, setConvidados] = useState(0)
  const [resultados, setResultados] = useState({ propostas: [], respostas: [] })
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: c } = await supabase
        .from('cotacoes')
        .select('*, cotacao_itens(*), convites(id)')
        .eq('id', id)
        .maybeSingle()
      if (c) {
        setCotacao(c)
        setItens((c.cotacao_itens || []).sort((a, b) => a.ordem - b.ordem))
        setConvidados(c.convites?.length || 0)
        setResultados(await buscarResultados(id))
        document.title = `Cotação ${numeroCotacao(c.numero)} - ${c.titulo}`
      }
      setCarregando(false)
    })()
    return () => { document.title = 'CotaCompara' }
  }, [id])

  const comp = useMemo(
    () => montarComparativo(itens, resultados.propostas, resultados.respostas),
    [itens, resultados]
  )

  // Ctrl+P também ajusta (não só o botão)
  useEffect(() => {
    const antes = () => ajustarFolha(folhaRef.current)
    const depois = () => restaurarFolha(folhaRef.current)
    window.addEventListener('beforeprint', antes)
    window.addEventListener('afterprint', depois)
    return () => {
      window.removeEventListener('beforeprint', antes)
      window.removeEventListener('afterprint', depois)
    }
  }, [])

  const imprimir = () => {
    ajustarFolha(folhaRef.current)
    // dá um quadro para o navegador recalcular antes de abrir a impressão
    requestAnimationFrame(() => setTimeout(() => window.print(), 50))
  }

  if (carregando) return <Carregando />
  if (!cotacao) return <div className="container"><div className="card">Cotação não encontrada. <Link to="/cotacoes">Voltar</Link></div></div>

  const local = [empresa?.cidade, empresa?.uf].filter(Boolean).join(' / ')
  const temPropostas = comp.colunas.length > 0

  return (
    <div className="imp-pagina">
      <div className="imp-barra no-print">
        <Link to={`/cotacoes/${id}`} className="voltar" style={{ margin: 0 }}><IconeVoltar /> Voltar</Link>
        <div style={{ display: 'flex', gap: 8 }}>
          {temPropostas && (
            <button className="btn btn-secundario btn-pequeno" onClick={() => exportarCsv(cotacao, comp)}>
              Exportar Excel
            </button>
          )}
          <button className="btn btn-primario btn-pequeno" onClick={imprimir}>Imprimir / Salvar PDF</button>
        </div>
      </div>
      <div className="imp-dica no-print">
        Para gerar o PDF, clique em <strong>Imprimir / Salvar PDF</strong>, escolha <strong>Salvar como PDF</strong> e
        deixe a orientação em <strong>Paisagem</strong> e a escala em <strong>Padrão/100%</strong>.
      </div>

      <div className="folha" ref={folhaRef}>
        {/* Cabeçalho */}
        <header className="imp-cab">
          <div className="imp-emp">
            <div className="imp-emp-nome">{empresa?.nome}</div>
            {empresa?.razao_social && empresa.razao_social !== empresa.nome && <div>{empresa.razao_social}</div>}
            {empresa?.cnpj && <div className="mono">CNPJ {empresa.cnpj}</div>}
            {(empresa?.endereco || local) && (
              <div>{[empresa?.endereco, local, empresa?.cep && `CEP ${empresa.cep}`].filter(Boolean).join(' · ')}</div>
            )}
            {(empresa?.telefone || empresa?.email_contato) && (
              <div>{[empresa?.telefone, empresa?.email_contato].filter(Boolean).join(' · ')}</div>
            )}
          </div>
          <div className="imp-doc">
            <div className="imp-doc-tipo">{temPropostas ? 'Mapa de Cotação' : 'Pedido de Cotação'}</div>
            <div className="imp-doc-num mono">{numeroCotacao(cotacao.numero)}</div>
            <div>Emitido em {formatarData(new Date().toISOString())}</div>
            <div>Situação: {STATUS_COTACAO[cotacao.status]?.rotulo}</div>
          </div>
        </header>

        <section className="imp-info">
          <div><span>Cotação</span><strong>{cotacao.titulo}</strong></div>
          <div><span>Criada em</span><strong>{formatarData(cotacao.created_at, false)}</strong></div>
          <div><span>Prazo de resposta</span><strong>{formatarData(cotacao.prazo_resposta)}</strong></div>
          <div><span>Itens</span><strong>{itens.length}</strong></div>
          <div><span>Respostas</span><strong>{comp.colunas.length} de {convidados}</strong></div>
        </section>

        {cotacao.observacoes && <div className="imp-obs"><strong>Observações:</strong> {cotacao.observacoes}</div>}

        {temPropostas ? (
          <>
            <ResumoResultado comp={comp} compacto />
            <MapaComparativo comp={comp} impressao />
            <div className="imp-legenda">
              Em cada célula: preço unitário e subtotal (unitário × quantidade). Verde = menor preço do item.
              Vencedor = menor total entre quem cotou todos os itens. "↻ era" = valor da proposta original antes da correção liberada pelo comprador.
            </div>
          </>
        ) : (
          <table className="tabela imp-itens">
            <thead>
              <tr><th style={{ width: 36 }}>#</th><th>Produto</th><th className="num">Quantidade</th><th>Unid.</th><th>Observação</th><th className="num" style={{ width: 140 }}>Preço unit.</th></tr>
            </thead>
            <tbody>
              {itens.map((i, n) => (
                <tr key={i.id}>
                  <td>{n + 1}</td><td>{i.produto}</td><td className="num">{formatarQtd(i.quantidade)}</td>
                  <td>{i.unidade}</td><td>{i.observacao || ''}</td><td className="num imp-linha-preco" />
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <footer className="imp-ass">
          <div><div className="imp-ass-linha" />Responsável pela cotação{empresa?.responsavel ? ` — ${empresa.responsavel}` : ''}</div>
          <div><div className="imp-ass-linha" />Aprovação</div>
        </footer>
        <div className="imp-rodape">Gerado pelo CotaCompara · cotacompara.amp.ia.br</div>
      </div>
    </div>
  )
}

/* ---------- Exportação para Excel (CSV com ; e vírgula decimal) ---------- */
function exportarCsv(cotacao, comp) {
  const n = (v) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','))
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const cols = comp.colunas

  const cab = ['#', 'Produto', 'Quantidade', 'Unidade',
    ...cols.flatMap((c) => [`${c.fornecedor_nome} - unitário`, `${c.fornecedor_nome} - subtotal`]),
    'Menor unitário']
  const linhas = comp.linhas.map((l, i) => [
    i + 1, l.item.produto, String(l.qtd).replace('.', ','), l.item.unidade,
    ...cols.flatMap((c) => { const v = l.valores[c.convite_id]; return [n(v?.unit), n(v?.sub)] }),
    n(l.menor),
  ])
  const rodape = [
    ['', 'Frete', '', '', ...cols.flatMap((c) => ['', n(c.frete)]), ''],
    ['', 'Prazo de entrega (dias)', '', '', ...cols.flatMap((c) => ['', c.prazo_entrega_dias ?? '']), ''],
    ['', 'Pagamento', '', '', ...cols.flatMap((c) => ['', c.condicao_pagamento || '']), ''],
    ['', 'TOTAL', '', '', ...cols.flatMap((c) => ['', n(c.total)]), ''],
    ['', 'Vencedor', comp.vencedor ? comp.vencedor.fornecedor_nome : 'nenhuma proposta completa'],
  ]
  const csv = '﻿' + [cab, ...linhas, [], ...rodape].map((r) => r.map(q).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `cotacao-${String(cotacao.numero).padStart(4, '0')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
