import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import RotaProtegida from './components/RotaProtegida'
import Carregando from './components/Carregando'
import Entrar from './pages/Entrar'
import Cadastro from './pages/Cadastro'
import EsqueciSenha from './pages/EsqueciSenha'
import NovaSenha from './pages/NovaSenha'
import Painel from './pages/Painel'
import MinhaEmpresa from './pages/MinhaEmpresa'
import EmBreve from './pages/EmBreve'
import ResponderCotacao from './pages/ResponderCotacao'
import AtivarConta from './pages/AtivarConta'

function Inicio() {
  const { session, carregando } = useAuth()
  if (carregando) return <Carregando />
  return <Navigate to={session ? '/painel' : '/entrar'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />

      {/* Públicas */}
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/nova-senha" element={<NovaSenha />} />

      {/* Conta AMP de outro app entrando pela 1ª vez no CotaCompara */}
      <Route path="/ativar" element={<AtivarConta />} />

      {/* Tela do fornecedor (sem login) */}
      <Route path="/r/:token" element={<ResponderCotacao />} />

      {/* Área do comprador */}
      <Route element={<RotaProtegida><Layout /></RotaProtegida>}>
        <Route path="/painel" element={<Painel />} />
        <Route path="/minha-empresa" element={<MinhaEmpresa />} />
        <Route path="/cotacoes" element={<EmBreve titulo="Cotações" fase="2" />} />
        <Route path="/fornecedores" element={<EmBreve titulo="Fornecedores" fase="2" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
