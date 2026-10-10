import Logo from './Logo'

export default function AuthLayout({ children }) {
  return (
    <div className="auth-pagina">
      <div className="auth-topo"><Logo /></div>
      <div className="auth-corpo">
        <div className="card auth-card">{children}</div>
      </div>
    </div>
  )
}
