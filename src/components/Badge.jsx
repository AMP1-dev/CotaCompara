export default function Badge({ cor, children }) {
  return <span className={`badge ${cor ? 'badge-' + cor : ''}`}>{children}</span>
}
