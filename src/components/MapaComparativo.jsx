import { formatarMoeda, formatarQtd } from '../lib/format'
import Badge from './Badge'

/**
 * Mapa comparativo: itens nas linhas, fornecedores nas colunas.
 * comp = resultado de montarComparativo()
 * onAbrir(conviteId) opcional: clique no nome do fornecedor
 * impressao: versão compacta para o relatório
 */
export default function MapaComparativo({ comp, onAbrir, impressao = false }) {
  const { colunas, linhas, vencedor } = comp
  if (!colunas.length) return null

  return (
    <div className={`mapa-wrap ${impressao ? 'mapa-impressao' : ''}`}>
      <table className="tabela mapa">
        <thead>
          <tr>
            <th className="mapa-prod">Produto</th>
            <th className="num">Qtd</th>
            {colunas.map((c) => (
              <th key={c.convite_id} className={`num mapa-forn ${c.vencedor ? 'venc' : ''}`}>
                {onAbrir && !impressao
                  ? <button className="mapa-link" onClick={() => onAbrir(c.convite_id)}>{c.fornecedor_nome}</button>
                  : c.fornecedor_nome}
                {c.revisao > 0 && <div className="mapa-era" style={{ fontWeight: 400 }}>proposta corrigida</div>}
                {impressao ? (
                  c.vencedor ? <span className="mapa-tag-imp venc"> ★ vencedor</span>
                    : !c.completa ? <span className="mapa-tag-imp"> ({c.itens_cotados}/{c.total_itens})</span> : null
                ) : (
                  <div className="mapa-tag">
                    {c.vencedor ? <Badge cor="verde">vencedor</Badge>
                      : !c.completa ? <Badge cor="laranja">{c.itens_cotados}/{c.total_itens} itens</Badge> : null}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.item.id}>
              <td className="mapa-prod">
                {l.item.produto}
                {l.cotacoes > 1 && l.maior > l.menor && !impressao && (
                  <div className="mapa-dif">variação de {formatarMoeda((l.maior - l.menor) * l.qtd)}</div>
                )}
              </td>
              <td className="num mapa-qtd">{formatarQtd(l.qtd)} <small>{l.item.unidade}</small></td>
              {colunas.map((c) => {
                const v = l.valores[c.convite_id]
                const menor = v && l.menores.has(c.convite_id) && l.cotacoes > 1
                return (
                  <td key={c.convite_id} className={`num ${menor ? 'mapa-menor' : ''} ${c.vencedor ? 'col-venc' : ''}`}>
                    {v ? (
                      impressao ? (
                        <span className="mapa-linha">
                          <span className="mapa-unit">{formatarMoeda(v.unit)}</span>
                          <span className="mapa-sub">{formatarMoeda(v.sub)}</span>
                          {v.era != null && <span className="mapa-era">era {typeof v.era === 'number' ? formatarMoeda(v.era) : v.era}</span>}
                        </span>
                      ) : (
                        <>
                          <div className="mapa-unit">{formatarMoeda(v.unit)}</div>
                          <div className="mapa-sub">{formatarMoeda(v.sub)}</div>
                          {v.era != null && (
                            <div className="mapa-era" title="Valor da proposta original (registrado, não editável)">
                              era {typeof v.era === 'number' ? formatarMoeda(v.era) : v.era}
                            </div>
                          )}
                          {v.obs && <div className="mapa-obs" title={v.obs}>{v.obs}</div>}
                        </>
                      )
                    ) : <span className="mapa-sem">{impressao ? '—' : 'não cotou'}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {impressao ? (
            <tr>
              <td colSpan={2}>Frete · entrega · pagamento</td>
              {colunas.map((c) => (
                <td key={c.convite_id} className={`num mapa-cond ${c.vencedor ? 'col-venc' : ''}`}>
                  {[c.frete == null ? null : c.frete === 0 ? 'frete grátis' : `frete ${formatarMoeda(c.frete)}`,
                    c.prazo_entrega_dias != null ? `${c.prazo_entrega_dias}d` : null,
                    c.condicao_pagamento].filter(Boolean).join(' · ') || '—'}
                </td>
              ))}
            </tr>
          ) : (<>
          <tr>
            <td colSpan={2}>Frete</td>
            {colunas.map((c) => (
              <td key={c.convite_id} className={`num ${c.vencedor ? 'col-venc' : ''}`}>
                {c.frete == null ? '—' : c.frete === 0 ? 'grátis' : formatarMoeda(c.frete)}
              </td>
            ))}
          </tr>
          <tr>
            <td colSpan={2}>Prazo de entrega</td>
            {colunas.map((c) => (
              <td key={c.convite_id} className={`num ${c.vencedor ? 'col-venc' : ''}`}>
                {c.prazo_entrega_dias != null ? `${c.prazo_entrega_dias} dias` : '—'}
              </td>
            ))}
          </tr>
          <tr>
            <td colSpan={2}>Pagamento</td>
            {colunas.map((c) => (
              <td key={c.convite_id} className={`num mapa-pag ${c.vencedor ? 'col-venc' : ''}`}>{c.condicao_pagamento || '—'}</td>
            ))}
          </tr>
          </>)}
          <tr className="mapa-total">
            <td colSpan={2}>Total</td>
            {colunas.map((c) => (
              <td key={c.convite_id} className={`num ${c.vencedor ? 'col-venc' : ''}`}>
                {formatarMoeda(c.total)}
                {!c.completa && <div className="mapa-sub">incompleto</div>}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      {!impressao && (
        <div className="mapa-legenda">
          <span><i className="leg-menor" /> menor preço do item</span>
          {vencedor && <span><i className="leg-venc" /> vencedor pelo total</span>}
        </div>
      )}
    </div>
  )
}

/** Faixa de resumo: vencedor + compra combinada */
export function ResumoResultado({ comp, compacto = false }) {
  const { vencedor, economia, economiaPct, combinada, colunas } = comp
  if (!colunas.length) return null
  return (
    <div className={`resultado ${compacto ? 'compacto' : ''}`}>
      {vencedor ? (
        <div className="resultado-venc">
          <div className="resultado-trofeu">🏆</div>
          <div>
            <div className="resultado-rot">Vencedor pelo total</div>
            <div className="resultado-nome">{vencedor.fornecedor_nome}</div>
            <div className="resultado-valor">{formatarMoeda(vencedor.total)}</div>
            {economia > 0 && (
              <div className="resultado-eco">
                {formatarMoeda(economia)} ({economiaPct.toFixed(1).replace('.', ',')}%) abaixo da proposta completa mais cara
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="resultado-venc sem">
          <div className="resultado-trofeu">⚠️</div>
          <div>
            <div className="resultado-rot">Sem vencedor pelo total</div>
            <div className="resultado-nome" style={{ fontSize: 16 }}>Nenhum fornecedor cotou todos os itens.</div>
            <div className="resultado-eco">Veja ao lado a melhor compra dividindo o pedido.</div>
          </div>
        </div>
      )}

      {combinada.vale && (
        <div className="resultado-comb">
          <div className="resultado-rot">Comprando cada item do mais barato</div>
          <div className="resultado-valor">{formatarMoeda(combinada.total)}</div>
          {combinada.economia > 0 && (
            <div className="resultado-eco verde">economia de {formatarMoeda(combinada.economia)} sobre o vencedor</div>
          )}
          <div className="resultado-div">
            {combinada.fornecedores.map((f) => (
              <span key={f.convite_id}>
                {f.nome}: {f.itens} {f.itens === 1 ? 'item' : 'itens'} · {formatarMoeda(f.subtotal + f.frete)}
                {f.frete > 0 && ' (c/ frete)'}
              </span>
            ))}
          </div>
          {combinada.itensSemPreco > 0 && (
            <div className="resultado-eco">{combinada.itensSemPreco} item(ns) sem nenhum preço</div>
          )}
        </div>
      )}
    </div>
  )
}
