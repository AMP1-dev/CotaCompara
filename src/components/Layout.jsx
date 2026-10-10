import { Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Header from './Header'

export default function Layout() {
  const { empresa } = useAuth()
  return (
    <>
      <Header />
      {empresa?.bloqueado && (
        <div className="faixa-bloqueio">
          Sua conta está suspensa: você pode consultar o histórico, mas não criar ou liberar cotações.
          Fale com o suporte do CotaCompara.
        </div>
      )}
      <main className="container">
        <Outlet />
      </main>
    </>
  )
}
