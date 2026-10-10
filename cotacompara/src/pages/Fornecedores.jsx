import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { emailValido, linkWhatsApp } from '../lib/format'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import { IconeEditar, IconeLixo, IconeWhats } from '../components/Icones'

const VAZIO = { nome: '', contato: '', email: '', whatsapp: '' }

export default function Fornecedores() {
  const { empresa } = useAuth()
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [modal, setModal] = useState(null) // null | { id?: uuid }
  const [form, setForm] = useState(VAZIO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('fornecedores')
      .select('*, convites(count)')
      .order('nome')
    if (error) console.error(error)
    setLista(data || [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter((f) =>
      (mostrarInativos || f.ativo) &&
      (!q || [f.nome, f.contato, f.email, f.whatsapp].some((v) => (v || '').toLowerCase().includes(q)))
    )
  }, [lista, busca, mostrarInativos])

  const qtdInativos = lista.filter((f) => !f.ativo).length

  const abrirNovo = () => { setForm(VAZIO); setErro(''); setModal({}) }
  const abrirEdicao = (f) => {
    setForm({ nome: f.nome || '', contato: f.contato || '', email: f.email || '', whatsapp: f.whatsapp || '' })
    setErro('')
    setModal({ id: f.id })
  }
  const fechar = () => setModal(null)
  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  const salvar = async (e) => {
    e?.preventDefault()
    setErro('')
    if (!form.nome.trim()) return setErro('Informe o nome do fornecedor.')
    if (!emailValido(form.email)) return setErro('Informe um e-mail válido — é por ele que a cotação vai chegar.')

    const dados = {
      nome: form.nome.trim(),
      contato: form.contato.trim() || null,
      email: form.email.trim().toLowerCase(),
      whatsapp: form.whatsapp.trim() || null,
    }
    setSalvando(true)
    const { error } = modal.id
      ? await supabase.from('fornecedores').update(dados).eq('id', modal.id)
      : await supabase.from('fornecedores').insert({ ...dados, empresa_id: empresa.id })
    setSalvando(false)

    if (error) {
      if (error.code === '23505') return setErro('Já existe um fornecedor com esse e-mail na sua agenda.')
      return setErro('Não foi possível salvar: ' + error.message)
    }
    fechar()
    carregar()
  }

  const alternarAtivo = async (f) => {
    await supabase.from('fornecedores').update({ ativo: !f.ativo }).eq('id', f.id)
    carregar()
  }

  const excluir = async (f) => {
    const usado = (f.convites?.[0]?.count || 0) > 0
    if (usado) {
      if (!window.confirm(`${f.nome} já participou de cotações e por isso não pode ser excluído (perderíamos o histórico de preços).\n\nDeseja desativá-lo? Ele some da lista, mas o histórico fica.`)) return
      return alternarAtivo(f)
    }
    if (!window.confirm(`Excluir ${f.nome}?`)) return
    await supabase.from('fornecedores').delete().eq('id', f.id)
    carregar()
  }

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>Fornecedores</h1>
          <div className="subtitulo">Sua agenda de quem recebe as cotações.</div>
        </div>
        <button className="btn btn-primario" onClick={abrirNovo}>+ Novo fornecedor</button>
      </div>

      {lista.length > 0 && (
        <div className="barra">
          <input className="input" placeholder="Buscar por nome, contato, e-mail..." value={busca}
            onChange={(e) => setBusca(e.target.value)} />
          {qtdInativos > 0 && (
            <label className="texto-suave" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
              Mostrar desativados ({qtdInativos})
            </label>
          )}
        </div>
      )}

      {carregando ? (
        <div className="card">Carregando...</div>
      ) : lista.length === 0 ? (
        <div className="card">
          <div className="vazio">
            <div className="icone">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </div>
            <h2>Nenhum fornecedor ainda</h2>
            <p>Cadastre quem você costuma consultar. Basta nome e e-mail — o fornecedor não precisa criar conta.</p>
            <button className="btn btn-primario" onClick={abrirNovo}>Cadastrar o primeiro</button>
          </div>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card texto-suave">Nenhum fornecedor encontrado para "{busca}".</div>
      ) : (
        <div className="lista">
          {filtrados.map((f) => {
            const qtd = f.convites?.[0]?.count || 0
            const zap = linkWhatsApp(f.whatsapp, `Olá ${f.contato || f.nome}!`)
            return (
              <div key={f.id} className={`lista-item ${f.ativo ? '' : 'inativo'}`}>
                <div className="principal">
                  <div className="titulo">{f.nome}</div>
                  <div className="meta">
                    {f.contato && <span>{f.contato}</span>}
                    <span>{f.email}</span>
                    {f.whatsapp && <span>{f.whatsapp}</span>}
                  </div>
                </div>
                {!f.ativo && <Badge>desativado</Badge>}
                {qtd > 0 && <Badge cor="azul">{qtd} {qtd === 1 ? 'cotação' : 'cotações'}</Badge>}
                <div className="acoes">
                  {zap && (
                    <a className="btn-icone whats" href={zap} target="_blank" rel="noreferrer" title="WhatsApp">
                      <IconeWhats />
                    </a>
                  )}
                  <button className="btn-icone" title="Editar" onClick={() => abrirEdicao(f)}><IconeEditar /></button>
                  {f.ativo ? (
                    <button className="btn-icone perigo" title="Excluir" onClick={() => excluir(f)}><IconeLixo /></button>
                  ) : (
                    <button className="btn btn-texto btn-pequeno" onClick={() => alternarAtivo(f)}>Reativar</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        aberto={!!modal}
        titulo={modal?.id ? 'Editar fornecedor' : 'Novo fornecedor'}
        onFechar={fechar}
        rodape={
          <>
            <button className="btn btn-secundario" onClick={fechar}>Cancelar</button>
            <button className="btn btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        {erro && <div className="alerta alerta-erro">{erro}</div>}
        <form onSubmit={salvar}>
          <div className="campo">
            <label>Nome / razão social *</label>
            <input className="input" autoFocus value={form.nome} onChange={set('nome')} placeholder="Ex.: Distribuidora Silva" />
          </div>
          <div className="campo">
            <label>E-mail *</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="vendas@fornecedor.com.br" />
            <small>A cotação chega neste e-mail, com um link para responder.</small>
          </div>
          <div className="linha-campos">
            <div className="campo">
              <label>Contato</label>
              <input className="input" value={form.contato} onChange={set('contato')} placeholder="Nome do vendedor" />
            </div>
            <div className="campo">
              <label>WhatsApp</label>
              <input className="input" type="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="(19) 99999-9999" />
            </div>
          </div>
          <button type="submit" hidden />
        </form>
      </Modal>
    </>
  )
}
