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
import Fornecedores from './pages/Fornecedores'
import Cotacoes from './pages/Cotacoes'
import CotacaoEditar from './pages/CotacaoEditar'
import CotacaoDetalhe from './pages/CotacaoDetalhe'
import CotacaoImprimir from './pages/CotacaoImprimir'
import ExigirCnpj from './components/ExigirCnpj'
import Admin from './pages/Admin'
import RotaAdmin from './components/RotaAdmin'
import ResponderCotacao from './pages/ResponderCotacao'
import AtivarConta from './pages/AtivarConta'
import Orcamentos from './pages/Orcamentos'
import OrcamentoEditar from './pages/OrcamentoEditar'
import OrcamentoPublico from './pages/OrcamentoPublico'

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

      {/* Orçamento enviado pelo fornecedor ao cliente (sem login) */}
      <Route path="/o/:token" element={<OrcamentoPublico />} />

      {/* Relatório para impressão (sem menu) */}
      <Route path="/cotacoes/:id/imprimir" element={<RotaProtegida><CotacaoImprimir /></RotaProtegida>} />

      {/* Painel do administrador da plataforma */}
      <Route path="/admin" element={<RotaAdmin><Admin /></RotaAdmin>} />

      {/* Área do comprador */}
      <Route element={<RotaProtegida><Layout /></RotaProtegida>}>
        <Route path="/painel" element={<Painel />} />
        <Route path="/minha-empresa" element={<MinhaEmpresa />} />
        <Route path="/fornecedores" element={<Fornecedores />} />
        <Route path="/cotacoes" element={<Cotacoes />} />
        <Route path="/cotacoes/nova" element={<ExigirCnpj><CotacaoEditar /></ExigirCnpj>} />
        <Route path="/cotacoes/:id" element={<CotacaoDetalhe />} />
        <Route path="/cotacoes/:id/editar" element={<CotacaoEditar />} />
        <Route path="/orcamentos" element={<Orcamentos />} />
        <Route path="/orcamentos/novo" element={<ExigirCnpj><OrcamentoEditar /></ExigirCnpj>} />
        <Route path="/orcamentos/:id" element={<OrcamentoEditar />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
