import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase, traduzErro } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AuthLayout from '../components/AuthLayout'

export default function Entrar() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (session) return <Navigate to="/painel" replace />

  const entrar = async (e) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) return setErro(traduzErro(error))
    navigate(location.state?.de || '/painel', { replace: true })
  }

  return (
    <AuthLayout>
      <h1>Olá! Que bom te ver</h1>
      <p className="subtitulo">Entre para gerenciar suas cotações.</p>

      {erro && <div className="alerta alerta-erro">{erro}</div>}

      <form onSubmit={entrar}>
        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input id="senha" className="input" type="password" autoComplete="current-password" required
            value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        <button className="btn btn-primario btn-bloco" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div className="auth-rodape">
        <Link to="/esqueci-senha">Esqueci minha senha</Link>
        <div style={{ marginTop: 10 }}>
          Ainda não tem conta? <Link to="/cadastro">Criar conta grátis</Link>
        </div>
      </div>
    </AuthLayout>
  )
}
