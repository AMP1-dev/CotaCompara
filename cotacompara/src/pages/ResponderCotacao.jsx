import Logo from '../components/Logo'

// Tela pública do fornecedor — implementada na fase 3
export default function ResponderCotacao() {
  return (
    <div className="auth-pagina">
      <div className="auth-topo"><Logo /></div>
      <div className="auth-corpo">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <h1>Cotação</h1>
          <p className="subtitulo">Em breve você poderá responder esta cotação por aqui.</p>
        </div>
      </div>
    </div>
  )
}
