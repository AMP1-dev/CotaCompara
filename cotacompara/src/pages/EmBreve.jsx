export default function EmBreve({ titulo, fase }) {
  return (
    <>
      <div className="titulo-pagina"><h1>{titulo}</h1></div>
      <div className="card">
        <div className="vazio">
          <div className="icone">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </div>
          <h2>Chegando na fase {fase}</h2>
          <p>Esta tela está em construção.</p>
        </div>
      </div>
    </>
  )
}
