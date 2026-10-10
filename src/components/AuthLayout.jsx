import Logo from './Logo'
import CarrosselCategorias from './CarrosselCategorias'

// Tela de entrada dividida: carrossel de categorias à esquerda, formulário à direita
export default function AuthLayout({ children }) {
  return (
    <div className="split">
      <aside className="split-esq">
        <div className="split-logo"><Logo /></div>
        <CarrosselCategorias />
        <div className="split-chamada">
          <strong>Mande a lista, receba os preços, compare em segundos.</strong>
          <span>O fornecedor responde pelo link, sem cadastro e sem planilha.</span>
        </div>
      </aside>
      <main className="split-dir">
        <div className="split-logo-mobile"><Logo /></div>
        <div className="split-form">{children}</div>
        <div className="split-rodape">CotaCompara · cotacompara.amp.ia.br</div>
      </main>
    </div>
  )
}
