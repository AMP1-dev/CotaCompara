import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Carregando from './Carregando'

export default function RotaProtegida({ children }) {
  const { session, empresa, carregando } = useAuth()
  const location = useLocation()

  if (carregando) return <Carregando />
  if (!session) return <Navigate to="/entrar" replace state={{ de: location.pathname }} />
  // Conta AMP existente (de outro app) que ainda não ativou o CotaCompara
  if (!empresa) return <Navigate to="/ativar" replace />
  return children
}
