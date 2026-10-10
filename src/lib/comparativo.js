// Cálculo do mapa comparativo de uma cotação
//
// Regras:
// - Vencedor = menor TOTAL entre as propostas COMPLETAS (cotaram todos os itens).
//   Quem deixou item sem preço não ganha pelo total, mesmo com valor menor.
// - Total da proposta = soma(preço unitário × quantidade) + frete.
// - Compra combinada = cada item do fornecedor mais barato + o frete de cada
//   fornecedor envolvido. Mostra quanto se economizaria dividindo o pedido.

const num = (v) => (v == null ? null : Number(v))

/**
 * Vencedor a partir das linhas da view v_propostas (usado no Painel).
 * Retorna { vencedor, completas, economia, economiaPct }
 */
export function vencedorDasPropostas(propostas) {
  const completas = propostas
    .filter((p) => p.itens_cotados === p.total_itens && p.total_itens > 0)
    .map((p) => ({ ...p, total: Number(p.total) }))
    .sort((a, b) => a.total - b.total)
  const vencedor = completas[0] || null
  const maior = completas[completas.length - 1]
  const economia = vencedor && completas.length > 1 ? maior.total - vencedor.total : 0
  const economiaPct = economia && maior.total ? (economia / maior.total) * 100 : 0
  return { vencedor, completas, economia, economiaPct }
}

/**
 * @param itens      cotacao_itens [{id, produto, quantidade, unidade, ordem}]
 * @param propostas  linhas de v_propostas
 * @param respostas  respostas_itens [{convite_id, item_id, preco_unitario, disponivel, observacao}]
 */
export function montarComparativo(itens, propostas, respostas) {
  // preço por convite/item
  const precos = {}
  const obs = {}
  for (const r of respostas) {
    if (r.observacao) (obs[r.convite_id] ||= {})[r.item_id] = r.observacao
    if (r.disponivel && r.preco_unitario != null) {
      ;(precos[r.convite_id] ||= {})[r.item_id] = Number(r.preco_unitario)
    }
  }

  const { vencedor, economia, economiaPct } = vencedorDasPropostas(propostas)

  // ordem das colunas: completas pelo total, depois incompletas (mais itens cotados primeiro)
  const colunas = propostas
    .map((p) => ({
      ...p,
      total: Number(p.total),
      frete: num(p.frete),
      completa: p.itens_cotados === p.total_itens && p.total_itens > 0,
      vencedor: vencedor?.convite_id === p.convite_id,
    }))
    .sort((a, b) =>
      a.completa !== b.completa ? (a.completa ? -1 : 1)
      : a.completa ? a.total - b.total
      : b.itens_cotados - a.itens_cotados || a.total - b.total)

  const linhas = [...itens]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((item) => {
      const qtd = Number(item.quantidade)
      const valores = {}
      for (const c of colunas) {
        const unit = precos[c.convite_id]?.[item.id]
        valores[c.convite_id] = unit == null ? null : { unit, sub: unit * qtd, obs: obs[c.convite_id]?.[item.id] }
      }
      const validos = colunas.filter((c) => valores[c.convite_id])
      const menor = validos.length ? Math.min(...validos.map((c) => valores[c.convite_id].unit)) : null
      const maior = validos.length ? Math.max(...validos.map((c) => valores[c.convite_id].unit)) : null
      const menores = new Set(validos.filter((c) => valores[c.convite_id].unit === menor).map((c) => c.convite_id))
      // em caso de empate, a compra combinada prefere o vencedor geral
      const escolhido = menor == null ? null
        : menores.has(vencedor?.convite_id) ? vencedor.convite_id
        : validos.find((c) => menores.has(c.convite_id)).convite_id
      return { item, qtd, valores, menor, maior, menores, escolhido, cotacoes: validos.length }
    })

  // compra combinada
  const porFornecedor = {}
  let totalCombinado = 0
  let semPreco = 0
  for (const l of linhas) {
    if (!l.escolhido) { semPreco++; continue }
    const sub = l.menor * l.qtd
    totalCombinado += sub
    const pf = (porFornecedor[l.escolhido] ||= { convite_id: l.escolhido, itens: 0, subtotal: 0 })
    pf.itens++
    pf.subtotal += sub
  }
  const fornecedoresCombinada = Object.values(porFornecedor).map((pf) => {
    const c = colunas.find((x) => x.convite_id === pf.convite_id)
    const frete = c?.frete || 0
    totalCombinado += frete
    return { ...pf, nome: c?.fornecedor_nome, frete }
  })
  const economiaCombinada = vencedor ? Math.max(0, vencedor.total - totalCombinado) : 0

  return {
    colunas,
    linhas,
    vencedor: colunas.find((c) => c.vencedor) || null,
    economia,
    economiaPct,
    combinada: {
      total: totalCombinado,
      fornecedores: fornecedoresCombinada.sort((a, b) => b.subtotal - a.subtotal),
      itensSemPreco: semPreco,
      economia: economiaCombinada,
      // só vale mostrar se dividir o pedido realmente compensa
      vale: fornecedoresCombinada.length > 1 && (!vencedor || economiaCombinada > 0.009),
    },
  }
}
