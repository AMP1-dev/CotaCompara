import { supabase } from './supabase'

// Busca propostas (view v_propostas) e preços de uma ou várias cotações
export async function buscarResultados(cotacaoIds) {
  const ids = Array.isArray(cotacaoIds) ? cotacaoIds : [cotacaoIds]
  if (!ids.length) return { propostas: [], respostas: [] }
  const { data: propostas, error } = await supabase.from('v_propostas').select('*').in('cotacao_id', ids)
  if (error) console.error('v_propostas:', error)
  const convites = (propostas || []).map((p) => p.convite_id)
  if (!convites.length) return { propostas: [], respostas: [] }
  const { data: respostas } = await supabase
    .from('respostas_itens')
    .select('convite_id, item_id, preco_unitario, disponivel, observacao')
    .in('convite_id', convites)
  return { propostas: propostas || [], respostas: respostas || [] }
}
