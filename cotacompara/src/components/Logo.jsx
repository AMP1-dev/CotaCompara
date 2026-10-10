import { Link } from 'react-router-dom'

export default function Logo({ to = '/' }) {
  return (
    <Link to={to} className="logo" aria-label="CotaCompara">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#fff" />
        <path d="M16 40l10-12 8 7 14-17" fill="none" stroke="#2D3277" strokeWidth="6"
          strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="48" cy="18" r="4" fill="#3483FA" />
      </svg>
      <span>Cota<b>Compara</b></span>
    </Link>
  )
}
