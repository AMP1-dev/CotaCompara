import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cnpjValido, dadosParaEmpresa, nomeExibicao } from '../lib/cnpj'
import { useAuth } from '../contexts/AuthContext'
import CampoCnpj from '../components/CampoCnpj'
import Badge from '../components/Badge'

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const CAMPOS = ['nome', 'responsavel', 'cnpj', 'razao_social', 'nome_fantasia', 'telefone', 'email_contato', 'cep', 'endereco', 'cidade', 'uf']

export default function MinhaEmpresa() {
  const { empresa, user, recarregarEmpresa } = useAuth()
  const [form, setForm] = useState(null)
  const [situacao, setSituacao] = useState(null)
  const [msg, setMsg] = useState(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (empresa) {
      setForm(Object.fromEntries(CAMPOS.map((c) => [c, empresa[c] || ''])))
      setSituacao(empresa.situacao_cnpj || null)
    }
  }, [empresa])

  if (!form) return <div className="card">Carregando...</div>

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  // Dados da Receita sobrescrevem os campos oficiais; nome de exibição só se estiver vazio
  const aoReceberCnpj = (d) => {
    const e = dadosParaEmpresa(d)
    setSituacao(e.situacao_cnpj)
    setForm((f) => ({
      ...f,
      cnpj: e.cnpj,
      razao_social: e.razao_social || '',
      nome_fantasia: e.nome_fantasia || '',
      cep: e.cep || f.cep,
      endereco: e.endereco || f.endereco,
      cidade: e.cidade || f.cidade,
      uf: e.uf || f.uf,
      email_contato: f.email_contato || e.email_contato || '',
      telefone: f.telefone || d.telefone || '',
      nome: f.nome && f.nome !== 'Minha empresa' ? f.nome : nomeExibicao(d),
    }))
    setMsg({ tipo: 'info', texto: 'Dados da Receita carregados. Confira e clique em Salvar.' })
  }

  const salvar = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (!form.nome.trim()) return setMsg({ tipo: 'erro', texto: 'Informe o nome da empresa.' })
    if (form.cnpj && !cnpjValido(form.cnpj)) return setMsg({ tipo: 'erro', texto: 'CNPJ inválido.' })
    setSalvando(true)
    const dados = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, String(v).trim() === '' ? null : String(v).trim()])
    )
    dados.situacao_cnpj = form.cnpj ? situacao : null
    const { error } = await supabase.from('empresas').update(dados).eq('id', empresa.id)
    setSalvando(false)
    if (error) return setMsg({ tipo: 'erro', texto: 'Não foi possível salvar: ' + error.message })
    await recarregarEmpresa()
    setMsg({ tipo: 'ok', texto: 'Dados salvos!' })
  }

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>Minha empresa</h1>
          <div className="subtitulo">Estes dados aparecem para o fornecedor e no relatório impresso.</div>
        </div>
      </div>

      <form className="card" onSubmit={salvar} style={{ maxWidth: 820 }}>
        {msg && <div className={`alerta alerta-${msg.tipo}`}>{msg.texto}</div>}

        <div className="linha-campos">
          <CampoCnpj valor={form.cnpj} onChange={(v) => setForm((f) => ({ ...f, cnpj: v }))} onDados={aoReceberCnpj}
            ajuda="Busca automática na Receita Federal." />
          <div className="campo">
            <label>Situação cadastral</label>
            <div style={{ paddingTop: 10 }}>
              {situacao
                ? <Badge cor={situacao.toUpperCase() === 'ATIVA' ? 'verde' : 'vermelho'}>{situacao}</Badge>
                : <span className="texto-suave">—</span>}
            </div>
          </div>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label>Razão social</label>
            <input className="input" value={form.razao_social} onChange={set('razao_social')} />
          </div>
          <div className="campo">
            <label>Nome fantasia</label>
            <input className="input" value={form.nome_fantasia} onChange={set('nome_fantasia')} />
          </div>
        </div>

        <div className="campo">
          <label>Nome exibido nas cotações *</label>
          <input className="input" value={form.nome} onChange={set('nome')} required />
          <small>É como o fornecedor vai ver sua empresa no e-mail e na tela da cotação.</small>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label>Responsável</label>
            <input className="input" value={form.responsavel} onChange={set('responsavel')} />
          </div>
          <div className="campo">
            <label>WhatsApp / telefone</label>
            <input className="input" value={form.telefone} onChange={set('telefone')} />
          </div>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label>E-mail de contato</label>
            <input className="input" type="email" value={form.email_contato} onChange={set('email_contato')}
              placeholder={user?.email} />
          </div>
          <div className="campo">
            <label>CEP</label>
            <input className="input" value={form.cep} onChange={set('cep')} />
          </div>
        </div>

        <div className="campo">
          <label>Endereço</label>
          <input className="input" value={form.endereco} onChange={set('endereco')} placeholder="Rua, número, bairro" />
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label>Cidade</label>
            <input className="input" value={form.cidade} onChange={set('cidade')} />
          </div>
          <div className="campo">
            <label>UF</label>
            <select className="select" value={form.uf} onChange={set('uf')}>
              <option value="">—</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>

        <div className="campo">
          <label>E-mail de acesso</label>
          <input className="input" value={user?.email || ''} disabled />
        </div>

        <button className="btn btn-primario" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </form>
    </>
  )
}
