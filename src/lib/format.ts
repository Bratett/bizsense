export function formatGhs(amount: number): string {
  if (amount < 0)
    return `(GHS ${Math.abs(amount).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })})`
  return `GHS ${amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(isoDate: string): string {
  // DD/MM/YYYY — Ghanaian standard
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}
