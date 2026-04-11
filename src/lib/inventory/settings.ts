/**
 * Inventory behaviour settings.
 *
 * Sprint 5 hardcodes all values. The settings UI and database table
 * are Sprint 12 scope — at that point these functions will read from
 * a business_settings table instead of returning constants.
 */

// TODO Sprint 12: read from business_settings table
export function getAllowNegativeStock(_businessId: string): boolean {
  return false
}
