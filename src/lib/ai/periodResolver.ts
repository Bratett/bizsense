/**
 * Resolves a named period string into an absolute { from, to } ISO date range.
 * Extracted so it can be unit-tested in isolation from the tool handlers.
 */
export function resolvePeriod(
  period: string,
  date_from?: string,
  date_to?: string,
): { from: string; to: string } {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  switch (period) {
    case 'today':
      return { from: todayStr, to: todayStr }

    case 'this_week': {
      const day = today.getDay() // 0=Sun
      const diff = day === 0 ? -6 : 1 - day // Monday
      const monday = new Date(today)
      monday.setDate(today.getDate() + diff)
      return { from: monday.toISOString().slice(0, 10), to: todayStr }
    }

    case 'this_month':
      return {
        from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
        to: todayStr,
      }

    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 0)
      return {
        from: first.toISOString().slice(0, 10),
        to: last.toISOString().slice(0, 10),
      }
    }

    case 'this_quarter': {
      const q = Math.floor(today.getMonth() / 3)
      const firstMonth = q * 3
      const firstDay = new Date(today.getFullYear(), firstMonth, 1)
      return { from: firstDay.toISOString().slice(0, 10), to: todayStr }
    }

    case 'this_year':
      return { from: `${today.getFullYear()}-01-01`, to: todayStr }

    case 'custom':
      if (!date_from || !date_to) {
        throw new Error('date_from and date_to are required for custom period')
      }
      return { from: date_from, to: date_to }

    default:
      return { from: todayStr, to: todayStr }
  }
}
