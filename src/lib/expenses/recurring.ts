/**
 * Pure date-arithmetic helpers for recurring expenses.
 * No DB access, no circular imports — safe to import from tests directly.
 */

/**
 * Compute the next due date for a recurring expense given its last posted date.
 * Uses UTC methods throughout to avoid DST boundary bugs.
 * Month-end clamping (e.g. Jan 31 → Feb 28) is handled automatically
 * by JS's setUTCMonth when the day exceeds the target month's length.
 */
export function getNextDueDate(
  lastDate: string, // ISO date: YYYY-MM-DD
  recurrenceRule: string,
): string {
  const d = new Date(lastDate + 'T00:00:00Z')
  switch (recurrenceRule) {
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'biweekly':
      d.setUTCDate(d.getUTCDate() + 14)
      break
    case 'monthly': {
      const targetMonth = (d.getUTCMonth() + 1) % 12
      d.setUTCMonth(d.getUTCMonth() + 1)
      // If JS overflowed (e.g. Jan 31 → Mar 3), clamp to last day of target month
      if (d.getUTCMonth() !== targetMonth) d.setUTCDate(0)
      break
    }
    case 'quarterly': {
      const targetMonth = (d.getUTCMonth() + 3) % 12
      d.setUTCMonth(d.getUTCMonth() + 3)
      if (d.getUTCMonth() !== targetMonth) d.setUTCDate(0)
      break
    }
    default:
      throw new Error(`Unknown recurrence rule: ${recurrenceRule}`)
  }
  return d.toISOString().slice(0, 10)
}
