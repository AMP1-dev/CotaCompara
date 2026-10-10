import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Carregando from './Carregando'
import Header from './Header'

// Só administradores. Não exige empresa (admin pode não ser cliente).
export default function RotaAdmin({ children }) {
  const { session, user, isAdmin, adminErro, carregando } = useAuth()
  if (carregando) return <Carregando />
  if (!session) return <Navigate to="/entrar" replace />

  if (!isAdmin) {
    // mostra o motivo em vez de redirecionar sem explicação
    return (
      <>
        <Header />
        <main className="container">
          <div className="card" style={{ maxWidth: 680, margin: '0 auto' }}>
            <h2>Acesso de administrador não liberado</h2>
            <p className="texto-suave">Conta conectada: <strong>{user?.email}</strong></p>
            {adminErro ? (
              <div className="alerta alerta-erro">
                Erro ao verificar: <span className="mono">{adminErro}</span>
                <div style={{ marginTop: 6 }}>
                  Geralmente significa que o <strong>03_admin_planos_cnpj.sql</strong> não foi rodado (ou deu erro)
                  no Supabase, ou o cache da API ainda não atualizou.
                </div>
              </div>
            ) : (
              <div className="alerta alerta-info">
                A verificação funcionou, mas este e-mail não está na lista de administradores
                (<span className="mono">cotacompara.admins</span>).
              </div>
            )}
            <Link to="/painel" className="btn btn-secundario">Voltar ao painel</Link>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="container container-largo">{children}</main>
    </>
  )
}
