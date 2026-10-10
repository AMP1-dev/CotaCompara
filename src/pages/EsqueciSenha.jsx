import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, traduzErro, APP_URL } from '../lib/supabase'
import AuthLayout from '../components/AuthLayout'

export default function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${APP_URL}/nova-senha`,
    })
    setEnviando(false)
    if (error) return setErro(traduzErro(error))
    setEnviado(true)
  }

  return (
    <AuthLayout>
      <h1>Recuperar senha</h1>
      {enviado ? (
        <>
          <p className="subtitulo">
            Se <strong>{email}</strong> estiver cadastrado, você vai receber um link para criar uma nova senha.
          </p>
          <Link to="/entrar" className="btn btn-secundario btn-bloco">Voltar para entrar</Link>
        </>
      ) : (
        <>
          <p className="subtitulo">Informe seu e-mail e enviaremos um link.</p>
          {erro && <div className="alerta alerta-erro">{erro}</div>}
          <form onSubmit={enviar}>
            <div className="campo">
              <label htmlFor="email">E-mail</label>
              <input id="email" className="input" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-primario btn-bloco" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar link'}
            </button>
          </form>
          <div className="auth-rodape"><Link to="/entrar">Voltar</Link></div>
        </>
      )}
    </AuthLayout>
  )
}
