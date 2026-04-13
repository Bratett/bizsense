export function formatGhs(amount: number | string | null | undefined): string {
  if (amount == null) return 'GHS 0.00'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return 'GHS 0.00'
  if (num < 0)
    return `(GHS ${Math.abs(num).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })})`
  return `GHS ${num.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(isoDate: string): string {
  // DD/MM/YYYY — Ghanaian standard
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

const AVATAR_COLORS = [
  'bg-green-700',
  'bg-blue-600',
  'bg-amber-600',
  'bg-purple-600',
  'bg-teal-600',
  'bg-orange-600',
  'bg-rose-600',
]

export function avatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
