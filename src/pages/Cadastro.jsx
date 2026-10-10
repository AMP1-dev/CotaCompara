import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase, traduzErro, APP_URL, APP_ID } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AuthLayout from '../components/AuthLayout'

export default function Cadastro() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ responsavel: '', empresa: '', telefone: '', email: '', senha: '' })
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)

  if (session && !confirmar) return <Navigate to="/painel" replace />

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  const cadastrar = async (e) => {
    e.preventDefault()
    setErro('')
    if (form.senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')

    setEnviando(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.senha,
      options: {
        emailRedirectTo: `${APP_URL}/painel`,
        data: {
          app: APP_ID, // o gatilho do banco só cria a empresa com essa marca
          responsavel: form.responsavel.trim(),
          empresa: form.empresa.trim(),
          telefone: form.telefone.trim(),
        },
      },
    })
    setEnviando(false)
    if (error) return setErro(traduzErro(error))
    // Se a confirmação de e-mail estiver ligada no Supabase, não vem sessão
    if (!data.session) return setConfirmar(true)
    navigate('/painel', { replace: true })
  }

  if (confirmar) {
    return (
      <AuthLayout>
        <h1>Confira seu e-mail</h1>
        <p className="subtitulo">
          Enviamos um link de confirmação para <strong>{form.email}</strong>.
          Clique nele para ativar sua conta.
        </p>
        <div className="alerta alerta-info">Não chegou? Olhe a caixa de spam ou promoções.</div>
        <Link to="/entrar" className="btn btn-secundario btn-bloco">Voltar para entrar</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1>Crie sua conta</h1>
      <p className="subtitulo">Leva menos de 1 minuto. Sem cartão de crédito.</p>

      {erro && <div className="alerta alerta-erro">{erro}</div>}

      <form onSubmit={cadastrar}>
        <div className="campo">
          <label htmlFor="empresa">Nome da empresa (ou seu nome, se for pessoa física)</label>
          <input id="empresa" className="input" required autoComplete="organization"
            value={form.empresa} onChange={set('empresa')} />
          <small>É o nome que o fornecedor vai ver na cotação.</small>
        </div>
        <div className="campo">
          <label htmlFor="responsavel">Seu nome</label>
          <input id="responsavel" className="input" required autoComplete="name"
            value={form.responsavel} onChange={set('responsavel')} />
        </div>
        <div className="campo">
          <label htmlFor="telefone">WhatsApp / telefone</label>
          <input id="telefone" className="input" type="tel" autoComplete="tel" placeholder="(19) 99999-9999"
            value={form.telefone} onChange={set('telefone')} />
        </div>
        <div className="campo">
          <label htmlFor="email">E-mail de acesso</label>
          <input id="email" className="input" type="email" required autoComplete="email"
            value={form.email} onChange={set('email')} />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input id="senha" className="input" type="password" required minLength={6} autoComplete="new-password"
            value={form.senha} onChange={set('senha')} />
          <small>Mínimo de 6 caracteres.</small>
        </div>
        <button className="btn btn-primario btn-bloco" disabled={enviando}>
          {enviando ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>

      <div className="auth-rodape">
        Já tem conta? <Link to="/entrar">Entrar</Link>
      </div>
    </AuthLayout>
  )
}
