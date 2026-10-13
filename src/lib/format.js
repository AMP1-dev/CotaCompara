// Utilitários de formatação e status — CotaCompara

export const STATUS_COTACAO = {
  rascunho:  { rotulo: 'Rascunho',  cor: '' },
  enviada:   { rotulo: 'Aberta',    cor: 'azul' },
  encerrada: { rotulo: 'Encerrada', cor: 'verde' },
  cancelada: { rotulo: 'Cancelada', cor: 'vermelho' },
}

export const STATUS_CONVITE = {
  pendente:   { rotulo: 'Não enviado', cor: '' },
  enviado:    { rotulo: 'Enviado',     cor: 'azul' },
  aberto:     { rotulo: 'Visualizou',  cor: 'laranja' },
  respondido: { rotulo: 'Respondeu',   cor: 'verde' },
  recusado:   { rotulo: 'Recusou',     cor: 'vermelho' },
}

export const UNIDADES = ['UN', 'CX', 'PCT', 'FD', 'RESMA', 'BL', 'KIT', 'JG', 'FR', 'TB', 'CT', 'KG', 'G', 'L', 'ML', 'M', 'M²', 'M³', 'SC', 'RL', 'PAR', 'DZ', 'GL', 'LT']

export const STATUS_ORCAMENTO = {
  rascunho: { rotulo: 'Rascunho', cor: '' },
  enviado:  { rotulo: 'Enviado',  cor: 'azul' },
  aprovado: { rotulo: 'Aprovado', cor: 'verde' },
  recusado: { rotulo: 'Recusado', cor: 'vermelho' },
}

export const numeroCotacao = (n) => '#' + String(n || 0).padStart(4, '0')

export function formatarData(iso, comHora = true) {
  if (!iso) return '—'
  const d = new Date(iso)
  const data = d.toLocaleDateString('pt-BR')
  if (!comHora) return data
  return `${data} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export const formatarQtd = (n) =>
  Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export const formatarMoeda = (n) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Aceita "1.234,56", "1234,56", "1234.56", "10"
export function parseNumero(texto) {
  if (texto == null) return NaN
  let s = String(texto).trim().replace(/\s/g, '').replace(/[R$]/g, '')
  if (!s) return NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  return Number(s)
}

export const soDigitos = (s) => String(s || '').replace(/\D/g, '')

export function linkWhatsApp(telefone, texto) {
  let n = soDigitos(telefone)
  if (!n) return null
  if (!n.startsWith('55') || n.length <= 11) n = '55' + n
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}

export const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim())

// datetime-local <-> ISO
export function paraInputLocal(data) {
  if (!data) return ''
  const d = new Date(data)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const deInputLocal = (s) => (s ? new Date(s).toISOString() : null)

export function prazoPadrao(dias = 3) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(18, 0, 0, 0)
  return d
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    window.prompt('Copie o link:', texto)
    return false
  }
}
