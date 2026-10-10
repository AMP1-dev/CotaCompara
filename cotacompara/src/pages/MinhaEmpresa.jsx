import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export default function MinhaEmpresa() {
  const { empresa, user, recarregarEmpresa } = useAuth()
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (empresa) {
      setForm({
        nome: empresa.nome || '',
        responsavel: empresa.responsavel || '',
        cnpj: empresa.cnpj || '',
        telefone: empresa.telefone || '',
        cidade: empresa.cidade || '',
        uf: empresa.uf || '',
      })
    }
  }, [empresa])

  if (!form) return <div className="card">Carregando...</div>

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  const salvar = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (!form.nome.trim()) return setMsg({ tipo: 'erro', texto: 'Informe o nome da empresa.' })
    setSalvando(true)
    const dados = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])
    )
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
          <div className="subtitulo">Estes dados aparecem para o fornecedor na tela da cotação.</div>
        </div>
      </div>

      <form className="card" onSubmit={salvar} style={{ maxWidth: 760 }}>
        {msg && <div className={`alerta alerta-${msg.tipo}`}>{msg.texto}</div>}

        <div className="linha-campos">
          <div className="campo">
            <label>Nome da empresa *</label>
            <input className="input" value={form.nome} onChange={set('nome')} required />
          </div>
          <div className="campo">
            <label>CNPJ / CPF</label>
            <input className="input" value={form.cnpj} onChange={set('cnpj')} placeholder="opcional" />
          </div>
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
