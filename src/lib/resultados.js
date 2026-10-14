import { supabase } from './supabase'

// Busca propostas (view v_propostas) e preços de uma ou várias cotações
export async function buscarResultados(cotacaoIds) {
  const ids = Array.isArray(cotacaoIds) ? cotacaoIds : [cotacaoIds]
  if (!ids.length) return { propostas: [], respostas: [] }
  // as duas consultas saem juntas (antes a 2ª esperava a 1ª)
  const [{ data: propostas, error }, { data: respostas }] = await Promise.all([
    supabase.from('v_propostas').select('*').in('cotacao_id', ids),
    supabase
      .from('respostas_itens')
      .select('convite_id, item_id, preco_unitario, disponivel, observacao, preco_original, disponivel_original, corrigido_em, convite:convites!inner(cotacao_id)')
      .in('convite.cotacao_id', ids),
  ])
  if (error) console.error('v_propostas:', error)
  if (!respostas) {
    // plano B (caso o filtro pelo join não seja aceito): busca os preços pelos convites
    const convites = (propostas || []).map((p) => p.convite_id)
    if (!convites.length) return { propostas: propostas || [], respostas: [] }
    const { data } = await supabase.from('respostas_itens')
      .select('convite_id, item_id, preco_unitario, disponivel, observacao, preco_original, disponivel_original, corrigido_em')
      .in('convite_id', convites)
    return { propostas: propostas || [], respostas: data || [] }
  }
  const validos = new Set((propostas || []).map((p) => p.convite_id))
  return {
    propostas: propostas || [],
    respostas: (respostas || []).filter((r) => validos.has(r.convite_id)).map(({ convite, ...r }) => r),
  }
}
