import { useEffect, useState } from 'react'

// Ilustrações próprias (SVG) — traço marinho, detalhes em azul e branco
const M = '#2D3277' // marinho
const A = '#3483FA' // azul
const B = '#FFFFFF'
const C = '#E3EDFB' // azul claro
const tr = { stroke: M, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' }

const Limpeza = () => (
  <svg viewBox="0 0 320 240" aria-hidden="true">
    {/* balde */}
    <path d="M150 120 h110 l-12 100 h-86 z" fill={B} {...tr} />
    <path d="M150 120 q55 -70 110 0" fill="none" {...tr} />
    <path d="M160 150 h90" fill="none" {...tr} stroke={A} />
    {/* borrifador */}
    <path d="M62 112 h52 v112 a8 8 0 0 1 -8 8 h-36 a8 8 0 0 1 -8 -8 z" fill={C} {...tr} />
    <path d="M70 112 v-22 h36 v22" fill={B} {...tr} />
    <path d="M66 90 h48 l18 -10 v-14 h-56 z" fill={A} {...tr} />
    <path d="M132 72 h14" {...tr} />
    <path d="M78 150 h36 M78 168 h24" fill="none" {...tr} stroke={A} />
    {/* bolhas */}
    <circle cx="176" cy="66" r="13" fill={B} {...tr} />
    <circle cx="206" cy="44" r="8" fill={B} {...tr} />
    <circle cx="230" cy="74" r="10" fill={B} {...tr} />
  </svg>
)

const Papelaria = () => (
  <svg viewBox="0 0 320 240" aria-hidden="true">
    {/* caderno */}
    <rect x="70" y="40" width="130" height="170" rx="10" fill={B} {...tr} />
    <path d="M98 40 v170" {...tr} stroke={A} />
    {[60, 86, 112, 138, 164, 190].map((y) => <circle key={y} cx="70" cy={y} r="6" fill={M} />)}
    <path d="M114 80 h66 M114 104 h66 M114 128 h48" fill="none" {...tr} />
    {/* lápis */}
    <g transform="rotate(35 240 130)">
      <rect x="226" y="40" width="28" height="140" rx="4" fill={A} {...tr} />
      <path d="M226 180 l14 32 l14 -32 z" fill={B} {...tr} />
      <rect x="226" y="40" width="28" height="18" fill={C} {...tr} />
    </g>
    {/* clipe */}
    <path d="M242 206 v-34 a12 12 0 0 1 24 0 v40 a8 8 0 0 1 -16 0 v-34" fill="none" {...tr} />
  </svg>
)

const Hospitalar = () => (
  <svg viewBox="0 0 320 240" aria-hidden="true">
    {/* maleta de primeiros socorros */}
    <path d="M128 70 v-18 a8 8 0 0 1 8 -8 h48 a8 8 0 0 1 8 8 v18" fill="none" {...tr} />
    <rect x="70" y="70" width="180" height="130" rx="14" fill={B} {...tr} />
    <path d="M148 108 h24 v20 h20 v24 h-20 v20 h-24 v-20 h-20 v-24 h20 z" fill={A} {...tr} />
    {/* cápsula */}
    <g transform="rotate(-35 262 70)">
      <rect x="236" y="56" width="56" height="26" rx="13" fill={B} {...tr} />
      <path d="M264 56 a13 13 0 0 1 0 26 h15 a13 13 0 0 0 0 -26 z" fill={C} />
      <rect x="236" y="56" width="56" height="26" rx="13" fill="none" {...tr} />
      <path d="M264 56 v26" {...tr} />
    </g>
    {/* termômetro */}
    <g transform="rotate(30 50 170)">
      <rect x="42" y="110" width="16" height="78" rx="8" fill={B} {...tr} />
      <circle cx="50" cy="196" r="12" fill={A} {...tr} />
      <path d="M50 160 v28" {...tr} stroke={A} />
    </g>
  </svg>
)

const Mecanica = () => (
  <svg viewBox="0 0 320 240" aria-hidden="true">
    {/* engrenagem */}
    <g transform="translate(200 110)">
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x="-11" y="-74" width="22" height="26" rx="4" fill={A} {...tr} transform={`rotate(${i * 45})`} />
      ))}
      <circle r="54" fill={B} {...tr} />
      <circle r="20" fill={C} {...tr} />
    </g>
    {/* chave de boca */}
    <g transform="rotate(-40 110 150)">
      <rect x="100" y="80" width="22" height="130" rx="10" fill={B} {...tr} />
      <path d="M90 82 a28 28 0 1 1 42 0 l-8 -10 v-26 h-26 v26 z" fill={B} {...tr} />
    </g>
    {/* parafuso */}
    <g transform="translate(70 196)">
      <path d="M-16 -10 h32 l8 10 l-8 10 h-32 l-8 -10 z" fill={C} {...tr} />
    </g>
  </svg>
)

const Construcao = () => (
  <svg viewBox="0 0 320 240" aria-hidden="true">
    {/* tijolos */}
    {[[60, 170], [118, 170], [176, 170], [89, 136], [147, 136], [118, 102]].map(([x, y], i) => (
      <rect key={i} x={x} y={y} width="56" height="32" rx="4" fill={i % 2 ? C : B} {...tr} />
    ))}
    {/* rolo de pintura */}
    <rect x="216" y="40" width="70" height="34" rx="10" fill={A} {...tr} />
    <path d="M286 57 h12 v38 h-48 v26" fill="none" {...tr} />
    <rect x="242" y="120" width="16" height="80" rx="6" fill={B} {...tr} />
    {/* capacete */}
    <path d="M58 90 a44 44 0 0 1 88 0 z" fill={A} {...tr} />
    <path d="M46 90 h112" {...tr} />
    <path d="M102 46 v20" {...tr} stroke={B} />
  </svg>
)

const Alimentos = () => (
  <svg viewBox="0 0 320 240" aria-hidden="true">
    {/* sacola */}
    <path d="M70 92 h120 l-10 120 h-100 z" fill={B} {...tr} />
    <path d="M100 92 v-14 a30 30 0 0 1 60 0 v14" fill="none" {...tr} />
    {/* baguete e garrafa */}
    <g transform="rotate(-18 120 70)"><rect x="104" y="24" width="28" height="86" rx="14" fill={C} {...tr} />
      <path d="M110 46 l16 -6 M110 66 l16 -6" {...tr} /></g>
    <path d="M150 92 v-34 l8 -10 v-14 h12 v14 l8 10 v34" fill={A} {...tr} />
    <path d="M96 140 h68" {...tr} stroke={A} />
    {/* xícara */}
    <path d="M206 132 h70 v40 a26 26 0 0 1 -26 26 h-18 a26 26 0 0 1 -26 -26 z" fill={B} {...tr} />
    <path d="M276 144 h8 a14 14 0 0 1 0 28 h-10" fill="none" {...tr} />
    <path d="M226 116 q-6 -12 0 -24 M246 116 q-6 -12 0 -24" fill="none" {...tr} stroke={A} />
    <path d="M196 212 h96" {...tr} />
  </svg>
)

const Informatica = () => (
  <svg viewBox="0 0 320 240" aria-hidden="true">
    <rect x="50" y="40" width="190" height="124" rx="10" fill={B} {...tr} />
    <rect x="66" y="56" width="158" height="92" rx="4" fill={C} />
    <path d="M86 118 l30 -28 l26 20 l40 -38" fill="none" {...tr} stroke={A} />
    <path d="M128 164 v26 h34 v-26 M104 196 h82" fill="none" {...tr} />
    {/* mouse */}
    <rect x="252" y="140" width="40" height="62" rx="20" fill={B} {...tr} />
    <path d="M272 140 v22" {...tr} />
    <path d="M272 140 q0 -40 -40 -36" fill="none" {...tr} />
  </svg>
)

export const CATEGORIAS = [
  { nome: 'Limpeza e higiene', Arte: Limpeza, itens: ['Detergente', 'Desinfetante', 'Papel toalha', 'Sacos de lixo'] },
  { nome: 'Papelaria e escritório', Arte: Papelaria, itens: ['Sulfite A4', 'Canetas', 'Cadernos', 'Toner'] },
  { nome: 'Hospitalar e saúde', Arte: Hospitalar, itens: ['Luvas', 'Gaze', 'Seringas', 'Álcool 70%'] },
  { nome: 'Mecânica e autopeças', Arte: Mecanica, itens: ['Filtros', 'Óleo', 'Rolamentos', 'Parafusos'] },
  { nome: 'Construção e reforma', Arte: Construcao, itens: ['Cimento', 'Tinta', 'Blocos', 'EPIs'] },
  { nome: 'Alimentos e copa', Arte: Alimentos, itens: ['Café', 'Açúcar', 'Água mineral', 'Descartáveis'] },
  { nome: 'Informática', Arte: Informatica, itens: ['Notebooks', 'Mouses', 'Cabos', 'Nobreaks'] },
]

export default function CarrosselCategorias({ intervalo = 3800 }) {
  const [atual, setAtual] = useState(0)
  const [pausado, setPausado] = useState(false)

  useEffect(() => {
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (pausado || reduzido) return
    const t = setInterval(() => setAtual((a) => (a + 1) % CATEGORIAS.length), intervalo)
    return () => clearInterval(t)
  }, [pausado, intervalo])

  return (
    <div className="carrossel" onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}>
      <div className="carrossel-palco">
        {CATEGORIAS.map(({ nome, Arte, itens }, i) => (
          <div key={nome} className={`carrossel-slide ${i === atual ? 'ativo' : ''}`} aria-hidden={i !== atual}>
            <div className="carrossel-arte"><Arte /></div>
            <div className="carrossel-rotulo">Cote</div>
            <div className="carrossel-nome">{nome}</div>
            <div className="carrossel-itens">
              {itens.map((it) => <span key={it}>{it}</span>)}
            </div>
          </div>
        ))}
      </div>
      <div className="carrossel-pontos" role="tablist" aria-label="Categorias">
        {CATEGORIAS.map((c, i) => (
          <button key={c.nome} role="tab" aria-selected={i === atual} aria-label={c.nome}
            className={i === atual ? 'ativo' : ''} onClick={() => setAtual(i)} />
        ))}
      </div>
    </div>
  )
}
