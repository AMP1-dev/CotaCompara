import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Logo from './Logo'

export default function Header() {
  const { empresa, user, sair } = useAuth()
  const [aberto, setAberto] = useState(false)
  const fechar = () => setAberto(false)
  const classe = ({ isActive }) => (isActive ? 'ativo' : '')

  return (
    <header className="header">
      <div className="header-inner">
        <Logo to="/painel" />

        <nav className={`nav ${aberto ? 'aberto' : ''}`}>
          <NavLink to="/painel" className={classe} onClick={fechar}>Painel</NavLink>
          <NavLink to="/cotacoes" className={classe} onClick={fechar}>Cotações</NavLink>
          <NavLink to="/fornecedores" className={classe} onClick={fechar}>Fornecedores</NavLink>
          <NavLink to="/minha-empresa" className={classe} onClick={fechar}>Minha empresa</NavLink>
        </nav>

        <div className="user-box">
          <span className="nome" title={user?.email}>{empresa?.nome || user?.email}</span>
          <button className="link-sair" onClick={sair}>Sair</button>
        </div>

        <button className="menu-mobile" onClick={() => setAberto(!aberto)} aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round">
            {aberto
              ? <path d="M6 6l12 12M18 6L6 18" />
              : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
    </header>
  )
}
