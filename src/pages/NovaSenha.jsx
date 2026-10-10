import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, traduzErro } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AuthLayout from '../components/AuthLayout'
import Carregando from '../components/Carregando'

export default function NovaSenha() {
  const { session, carregando } = useAuth()
  const navigate = useNavigate()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (carregando) return <Carregando />

  const salvar = async (e) => {
    e.preventDefault()
    setErro('')
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) return setErro(traduzErro(error))
    navigate('/painel', { replace: true })
  }

  return (
    <AuthLayout>
      <h1>Nova senha</h1>
      {!session ? (
        <div className="alerta alerta-erro">
          Link inválido ou expirado. Peça um novo em "Esqueci minha senha".
        </div>
      ) : (
        <>
          <p className="subtitulo">Digite a nova senha da sua conta.</p>
          {erro && <div className="alerta alerta-erro">{erro}</div>}
          <form onSubmit={salvar}>
            <div className="campo">
              <label htmlFor="senha">Nova senha</label>
              <input id="senha" className="input" type="password" required minLength={6}
                autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <button className="btn btn-primario btn-bloco" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
