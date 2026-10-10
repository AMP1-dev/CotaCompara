import { useRef, useState } from 'react'
import { consultarCnpj, cnpjValido, mascaraCnpj, MENSAGEM_CNPJ } from '../lib/cnpj'
import Badge from './Badge'

/**
 * Campo de CNPJ com máscara, validação e consulta automática na Receita.
 * - Busca sozinho quando completa os 14 dígitos (ou pelo botão "Buscar").
 * - onDados(dados) recebe: { cnpj, razao_social, nome_fantasia, situacao, telefone,
 *   email, cidade, uf, cep, endereco }
 */
export default function CampoCnpj({ valor, onChange, onDados, rotulo = 'CNPJ', ajuda, disabled }) {
  const [estado, setEstado] = useState(null) // null | 'buscando' | {erro} | {ok: dados}
  const ultimo = useRef('')

  const buscar = async (v = valor) => {
    const digitos = String(v || '').replace(/\D/g, '')
    if (!digitos) return
    if (!cnpjValido(digitos)) return setEstado({ erro: MENSAGEM_CNPJ.INVALIDO })
    if (ultimo.current === digitos && estado?.ok) return
    ultimo.current = digitos
    setEstado('buscando')
    try {
      const dados = await consultarCnpj(digitos)
      setEstado({ ok: dados })
      onDados?.(dados)
    } catch (e) {
      ultimo.current = ''
      setEstado({ erro: MENSAGEM_CNPJ[e.message] || MENSAGEM_CNPJ.FALHA })
    }
  }

  const alterar = (e) => {
    const v = mascaraCnpj(e.target.value)
    onChange(v)
    if (estado && estado !== 'buscando') setEstado(null)
    if (v.replace(/\D/g, '').length === 14) buscar(v)
  }

  const ok = estado?.ok
  const ativa = ok?.situacao?.toUpperCase() === 'ATIVA'

  return (
    <div className="campo">
      <label>{rotulo}</label>
      <div className="cnpj-linha">
        <input className="input" inputMode="numeric" placeholder="00.000.000/0000-00" value={valor || ''}
          onChange={alterar} disabled={disabled} />
        <button type="button" className="btn btn-secundario" onClick={() => buscar()}
          disabled={disabled || estado === 'buscando' || !valor}>
          {estado === 'buscando' ? 'Buscando...' : 'Buscar'}
        </button>
      </div>
      {estado?.erro && <small className="cnpj-erro">{estado.erro}</small>}
      {ok && (
        <div className="cnpj-ok">
          <Badge cor={ativa ? 'verde' : 'vermelho'}>{ok.situacao || 'situação desconhecida'}</Badge>
          <span>{ok.razao_social}</span>
        </div>
      )}
      {ok && !ativa && (
        <small className="cnpj-erro">Atenção: este CNPJ não está ATIVO na Receita Federal.</small>
      )}
      {!estado && ajuda && <small>{ajuda}</small>}
    </div>
  )
}
