import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { cnpjValido, dadosParaEmpresa, nomeExibicao } from '../lib/cnpj'
import CampoCnpj from './CampoCnpj'

/**
 * Porta de entrada da primeira cotação: a empresa precisa ter CNPJ.
 * Mostra o campo com busca na Receita e, ao confirmar, grava na empresa.
 * Quando a empresa já tem CNPJ, renderiza os filhos normalmente.
 */
export default function ExigirCnpj({ children }) {
  const { empresa, recarregarEmpresa } = useAuth()
  const [cnpj, setCnpj] = useState('')
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (empresa?.cnpj) return children

  const confirmar = async () => {
    setErro('')
    if (!cnpjValido(cnpj)) return setErro('Informe um CNPJ válido.')
    if (!dados || dados.cnpj !== cnpj) return setErro('Aguarde a consulta do CNPJ (ou clique em Buscar).')
    setSalvando(true)
    const extras = dadosParaEmpresa(dados)
    const nomeAtual = (empresa?.nome || '').trim()
    const { error } = await supabase.from('empresas').update({
      ...extras,
      telefone: empresa?.telefone || dados.telefone || null,
      // mantém o nome que o cliente escolheu; só troca o genérico
      nome: nomeAtual && nomeAtual !== 'Minha empresa' ? nomeAtual : nomeExibicao(dados) || nomeAtual,
    }).eq('id', empresa.id)
    setSalvando(false)
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    await recarregarEmpresa()
  }

  const ativa = dados?.situacao?.toUpperCase() === 'ATIVA'

  return (
    <div className="card exigir-cnpj">
      <div className="exigir-icone" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></svg>
      </div>
      <h2>Antes da primeira cotação, informe o CNPJ</h2>
      <p className="texto-suave">
        Os fornecedores recebem o pedido em nome da sua empresa. Com o CNPJ, buscamos os dados na Receita
        Federal e eles aparecem no e-mail, na tela de resposta e no relatório impresso. É só uma vez.
      </p>

      {erro && <div className="alerta alerta-erro">{erro}</div>}

      <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'left' }}>
        <CampoCnpj rotulo="CNPJ da empresa" valor={cnpj} onChange={(v) => { setCnpj(v); setErro('') }} onDados={setDados} />

        {dados && dados.cnpj === cnpj && (
          <div className="exigir-dados">
            <div><span>Razão social</span><strong>{dados.razao_social || '—'}</strong></div>
            {dados.nome_fantasia && <div><span>Nome fantasia</span><strong>{dados.nome_fantasia}</strong></div>}
            <div><span>Cidade</span><strong>{[dados.cidade, dados.uf].filter(Boolean).join(' / ') || '—'}</strong></div>
            {!ativa && (
              <div className="alerta alerta-erro" style={{ margin: '8px 0 0' }}>
                Este CNPJ está <strong>{dados.situacao || 'sem situação'}</strong> na Receita. Confira se é o CNPJ certo.
              </div>
            )}
          </div>
        )}

        <button className="btn btn-primario btn-bloco" onClick={confirmar}
          disabled={salvando || !dados || dados.cnpj !== cnpj}>
          {salvando ? 'Salvando...' : 'Confirmar e criar cotação'}
        </button>
      </div>
    </div>
  )
}
