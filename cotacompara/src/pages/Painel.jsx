import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, SCHEMA } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Painel() {
  const { empresa } = useAuth()
  const [n, setN] = useState({ abertas: 0, fornecedores: 0, respostas: 0, aguardando: 0 })
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!empresa) return
    let ativo = true

    const contar = async () => {
      const [abertas, fornecedores, respostas, aguardando] = await Promise.all([
        supabase.from('cotacoes').select('id', { count: 'exact', head: true }).eq('status', 'enviada'),
        supabase.from('fornecedores').select('id', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('convites').select('id', { count: 'exact', head: true }).eq('status', 'respondido'),
        supabase.from('convites').select('id', { count: 'exact', head: true }).in('status', ['enviado', 'aberto']),
      ])
      if (!ativo) return
      setN({
        abertas: abertas.count || 0,
        fornecedores: fornecedores.count || 0,
        respostas: respostas.count || 0,
        aguardando: aguardando.count || 0,
      })
      setCarregando(false)
    }
    contar()

    // atualiza sozinho quando um fornecedor responde
    const canal = supabase
      .channel('painel-convites')
      .on('postgres_changes', { event: '*', schema: SCHEMA, table: 'convites' }, contar)
      .subscribe()

    return () => { ativo = false; supabase.removeChannel(canal) }
  }, [empresa])

  const primeiroNome = (empresa?.responsavel || '').split(' ')[0]
  const vazio = !carregando && n.abertas === 0 && n.fornecedores === 0 && n.respostas === 0

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>{primeiroNome ? `Olá, ${primeiroNome}!` : 'Seu painel'}</h1>
          <div className="subtitulo">{empresa?.nome}</div>
        </div>
        <Link to="/cotacoes" className="btn btn-primario">+ Nova cotação</Link>
      </div>

      <div className="grid grid-4">
        <div className="card stat destaque">
          <div className="rotulo">Cotações abertas</div>
          <div className="valor">{carregando ? '–' : n.abertas}</div>
          <div className="detalhe">aguardando preços</div>
        </div>
        <div className="card stat verde">
          <div className="rotulo">Respostas recebidas</div>
          <div className="valor">{carregando ? '–' : n.respostas}</div>
          <div className="detalhe">fornecedores que responderam</div>
        </div>
        <div className="card stat laranja">
          <div className="rotulo">Aguardando resposta</div>
          <div className="valor">{carregando ? '–' : n.aguardando}</div>
          <div className="detalhe">convites enviados ou abertos</div>
        </div>
        <div className="card stat amarelo">
          <div className="rotulo">Fornecedores</div>
          <div className="valor">{carregando ? '–' : n.fornecedores}</div>
          <div className="detalhe">na sua agenda</div>
        </div>
      </div>

      {vazio && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="vazio">
            <div className="icone">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="M9 12h6M9 16h4" />
              </svg>
            </div>
            <h2>Comece sua primeira cotação</h2>
            <p>Cadastre seus fornecedores, monte a lista de produtos e dispare. Os preços caem aqui, já comparados.</p>
            <Link to="/fornecedores" className="btn btn-primario">Cadastrar fornecedores</Link>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Como funciona</h3>
        <div className="passos">
          <div className="passo">
            <div className="num">1</div>
            <div><strong>Monte a cotação</strong><p>Produtos e quantidades, em poucos cliques.</p></div>
          </div>
          <div className="passo">
            <div className="num">2</div>
            <div><strong>Envie aos fornecedores</strong><p>Cada um recebe um link por e-mail. Sem cadastro, sem senha.</p></div>
          </div>
          <div className="passo">
            <div className="num">3</div>
            <div><strong>Compare e decida</strong><p>Menor preço por item e no total, lado a lado.</p></div>
          </div>
        </div>
      </div>
    </>
  )
}
