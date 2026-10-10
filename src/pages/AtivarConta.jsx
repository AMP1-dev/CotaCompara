import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AuthLayout from '../components/AuthLayout'
import Carregando from '../components/Carregando'

// Quem já tem login na plataforma AMP (ex.: marketplace) e entra no
// CotaCompara pela primeira vez: só falta criar a empresa.
export default function AtivarConta() {
  const { session, user, empresa, carregando, recarregarEmpresa, sair } = useAuth()
  const navigate = useNavigate()
  const meta = user?.user_metadata || {}
  const [form, setForm] = useState({
    empresa: meta.empresa || '',
    responsavel: meta.responsavel || meta.nome || meta.full_name || '',
    telefone: meta.telefone || meta.whatsapp || '',
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (carregando) return <Carregando />
  if (!session) return <Navigate to="/entrar" replace />
  if (empresa) return <Navigate to="/painel" replace />

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  const ativar = async (e) => {
    e.preventDefault()
    setErro('')
    if (!form.empresa.trim()) return setErro('Informe o nome da empresa.')

    setSalvando(true)
    const { error } = await supabase.from('empresas').insert({
      owner_id: user.id,
      nome: form.empresa.trim(),
      responsavel: form.responsavel.trim() || null,
      telefone: form.telefone.trim() || null,
    })
    if (error) {
      setSalvando(false)
      return setErro('Não foi possível ativar: ' + error.message)
    }
    await recarregarEmpresa()
    setSalvando(false)
    navigate('/painel', { replace: true })
  }

  return (
    <AuthLayout>
      <h1>Ative o CotaCompara</h1>
      <p className="subtitulo">
        Você já tem conta na plataforma AMP (<strong>{user?.email}</strong>).
        Só falta dizer em nome de quem as cotações serão enviadas.
      </p>

      {erro && <div className="alerta alerta-erro">{erro}</div>}

      <form onSubmit={ativar}>
        <div className="campo">
          <label htmlFor="empresa">Nome da empresa (ou seu nome, se for pessoa física)</label>
          <input id="empresa" className="input" required value={form.empresa} onChange={set('empresa')} />
          <small>É o nome que o fornecedor vai ver na cotação.</small>
        </div>
        <div className="campo">
          <label htmlFor="responsavel">Seu nome</label>
          <input id="responsavel" className="input" value={form.responsavel} onChange={set('responsavel')} />
        </div>
        <div className="campo">
          <label htmlFor="telefone">WhatsApp / telefone</label>
          <input id="telefone" className="input" type="tel" value={form.telefone} onChange={set('telefone')} />
        </div>
        <button className="btn btn-primario btn-bloco" disabled={salvando}>
          {salvando ? 'Ativando...' : 'Ativar e começar'}
        </button>
      </form>

      <div className="auth-rodape">
        Não é você? <button className="btn-texto btn" onClick={sair}>Sair</button>
      </div>
    </AuthLayout>
  )
}
