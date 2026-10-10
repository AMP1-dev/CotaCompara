import { useEffect } from 'react'

export default function Modal({ aberto, titulo, onFechar, children, rodape, largura = 520 }) {
  useEffect(() => {
    if (!aberto) return
    const esc = (e) => e.key === 'Escape' && onFechar?.()
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <div className="modal" style={{ maxWidth: largura }} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  )
}
