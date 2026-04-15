'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses, businessSettings, taxComponents, accounts, users } from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SettingsActionResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

const VALID_ROLES = ['owner', 'manager', 'accountant', 'cashier'] as const
const VALID_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense', 'cogs'] as const
const VALID_CASH_FLOW_ACTIVITIES = ['operating', 'investing', 'financing', 'none'] as const

// ─── Business Profile ─────────────────────────────────────────────────────────

export async function updateBusinessProfile(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireRole(['owner', 'manager'])
  const businessId = user.businessId

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const industry = (formData.get('industry') as string | null)?.trim() || null
  const address = (formData.get('address') as string | null)?.trim() || null
  const phone = (formData.get('phone') as string | null)?.trim() || null
  const email = (formData.get('email') as string | null)?.trim() || null
  const tin = (formData.get('tin') as string | null)?.trim() || null
  const ssnitNumber = (formData.get('ssnitNumber') as string | null)?.trim() || null
  const vatRegistered = formData.get('vatRegistered') === 'on'
  const vatNumber = (formData.get('vatNumber') as string | null)?.trim() || null
  const financialYearStart = (formData.get('financialYearStart') as string | null)?.trim() || null

  const fieldErrors: Record<string, string> = {}

  if (!name) fieldErrors.name = 'Business name is required'
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fieldErrors.email = 'Enter a valid email address'
  if (vatRegistered && !vatNumber)
    fieldErrors.vatNumber = 'VAT number is required when VAT registered'

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  await db
    .update(businesses)
    .set({
      name,
      industry,
      address,
      phone,
      email,
      tin,
      ssnitNumber,
      vatRegistered,
      vatNumber,
      financialYearStart,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))

  return { success: true }
}

// ─── Business Settings (upsert) ───────────────────────────────────────────────

export async function updateBusinessSettings(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireRole(['owner', 'manager'])
  const businessId = user.businessId

  const allowNegativeStock = formData.get('allowNegativeStock') === 'on'
  const lowStockThresholdRaw = parseInt((formData.get('lowStockThreshold') as string) ?? '5', 10)
  const defaultPaymentTermsDaysRaw = parseInt(
    (formData.get('defaultPaymentTermsDays') as string) ?? '0',
    10,
  )
  const defaultCreditLimitRaw = parseFloat((formData.get('defaultCreditLimit') as string) ?? '0')
  const invoiceFooterText = (formData.get('invoiceFooterText') as string | null)?.trim() || null
  const momoMtnNumber = (formData.get('momoMtnNumber') as string | null)?.trim() || null
  const momoTelecelNumber = (formData.get('momoTelecelNumber') as string | null)?.trim() || null
  const momoAirtelNumber = (formData.get('momoAirtelNumber') as string | null)?.trim() || null
  const whatsappBusinessNumber =
    (formData.get('whatsappBusinessNumber') as string | null)?.trim() || null
  const whatsappNotifyInvoice = formData.get('whatsappNotifyInvoice') === 'on'
  const whatsappNotifyPayment = formData.get('whatsappNotifyPayment') === 'on'
  const whatsappNotifyLowStock = formData.get('whatsappNotifyLowStock') === 'on'
  const whatsappNotifyOverdue = formData.get('whatsappNotifyOverdue') === 'on'
  const whatsappNotifyPayroll = formData.get('whatsappNotifyPayroll') === 'on'

  const fieldErrors: Record<string, string> = {}

  const lowStockThreshold = isNaN(lowStockThresholdRaw) ? 5 : Math.max(0, lowStockThresholdRaw)
  const defaultPaymentTermsDays = isNaN(defaultPaymentTermsDaysRaw)
    ? 0
    : Math.max(0, defaultPaymentTermsDaysRaw)
  const defaultCreditLimit = isNaN(defaultCreditLimitRaw)
    ? '0'
    : Math.max(0, defaultCreditLimitRaw).toFixed(2)

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  const fields = {
    allowNegativeStock,
    lowStockThreshold,
    defaultPaymentTermsDays,
    defaultCreditLimit,
    invoiceFooterText,
    momoMtnNumber,
    momoTelecelNumber,
    momoAirtelNumber,
    whatsappBusinessNumber,
    whatsappNotifyInvoice,
    whatsappNotifyPayment,
    whatsappNotifyLowStock,
    whatsappNotifyOverdue,
    whatsappNotifyPayroll,
    updatedAt: new Date(),
  }

  await db
    .insert(businessSettings)
    .values({
      businessId,
      ...fields,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: businessSettings.businessId,
      set: fields,
    })

  return { success: true }
}

// ─── Tax Component — Update ───────────────────────────────────────────────────

export async function updateTaxComponent(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireRole(['owner'])
  const businessId = user.businessId

  const id = (formData.get('id') as string | null)?.trim() ?? ''
  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const rateRaw = (formData.get('rate') as string | null)?.trim() ?? ''
  const isActive = formData.get('isActive') !== 'false'

  if (!id) return { success: false, error: 'Tax component ID is required' }

  const fieldErrors: Record<string, string> = {}
  if (!name) fieldErrors.name = 'Name is required'

  const ratePercent = parseFloat(rateRaw)
  if (rateRaw !== '' && (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100)) {
    fieldErrors.rate = 'Rate must be between 0 and 100'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  // IDOR guard — confirm component belongs to this business
  const [existing] = await db
    .select({ id: taxComponents.id })
    .from(taxComponents)
    .where(and(eq(taxComponents.id, id), eq(taxComponents.businessId, businessId)))
  if (!existing) return { success: false, error: 'Tax component not found' }

  const updateValues: Record<string, unknown> = { name, isActive, updatedAt: new Date() }
  if (rateRaw !== '') {
    // Store as decimal (e.g. 15% → '0.1500')
    updateValues.rate = (ratePercent / 100).toFixed(4)
  }

  await db.update(taxComponents).set(updateValues).where(eq(taxComponents.id, id))

  return { success: true }
}

// ─── Tax Component — Add ──────────────────────────────────────────────────────

export async function addTaxComponent(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireRole(['owner'])
  const businessId = user.businessId

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const code = (formData.get('code') as string | null)?.trim().toUpperCase() ?? ''
  const rateRaw = (formData.get('rate') as string | null)?.trim() ?? ''
  const calculationOrderRaw = (formData.get('calculationOrder') as string | null)?.trim() ?? ''
  const appliesTo = (formData.get('appliesTo') as string | null)?.trim() || 'standard'

  const fieldErrors: Record<string, string> = {}
  if (!name) fieldErrors.name = 'Name is required'
  if (!code) fieldErrors.code = 'Code is required'

  const ratePercent = parseFloat(rateRaw)
  if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100)
    fieldErrors.rate = 'Rate must be between 0 and 100'

  const calculationOrder = parseInt(calculationOrderRaw, 10)
  if (isNaN(calculationOrder) || calculationOrder < 1)
    fieldErrors.calculationOrder = 'Calculation order must be a positive number'

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  await db.insert(taxComponents).values({
    businessId,
    name,
    code,
    rate: (ratePercent / 100).toFixed(4),
    calculationOrder,
    appliesTo,
    isActive: true,
    isCompounded: false,
    effectiveFrom: new Date(),
  })

  return { success: true }
}

// ─── Team — Invite Member ─────────────────────────────────────────────────────

export async function inviteTeamMember(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireRole(['owner'])
  const businessId = user.businessId

  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const fullName = (formData.get('fullName') as string | null)?.trim() || null
  const role = (formData.get('role') as string | null)?.trim() ?? ''

  const fieldErrors: Record<string, string> = {}
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fieldErrors.email = 'Enter a valid email address'
  if (!['manager', 'cashier', 'accountant'].includes(role)) fieldErrors.role = 'Select a valid role'

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  let newUserId: string
  try {
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { businessId, role, fullName },
    })
    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        return {
          success: false,
          error: 'This email is already registered',
          fieldErrors: { email: 'Already registered' },
        }
      }
      return { success: false, error: error.message }
    }
    newUserId = data.user.id
  } catch {
    return { success: false, error: 'Failed to send invitation. Please try again.' }
  }

  await db.insert(users).values({
    id: newUserId,
    businessId,
    fullName,
    role,
    isActive: true,
  })

  return { success: true }
}

// ─── Team — Update Role ───────────────────────────────────────────────────────

export async function updateTeamMemberRole(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireRole(['owner'])
  const businessId = user.businessId

  const targetUserId = (formData.get('userId') as string | null)?.trim() ?? ''
  const newRole = (formData.get('role') as string | null)?.trim() ?? ''

  if (!targetUserId) return { success: false, error: 'User ID is required' }
  if (!VALID_ROLES.includes(newRole as (typeof VALID_ROLES)[number]))
    return { success: false, error: 'Invalid role', fieldErrors: { role: 'Select a valid role' } }

  // IDOR guard
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.businessId, businessId)))
  if (!target) return { success: false, error: 'User not found' }

  await db
    .update(users)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(users.id, targetUserId))

  return { success: true }
}

// ─── Team — Deactivate / Reactivate ──────────────────────────────────────────

export async function deactivateTeamMember(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireRole(['owner'])
  const businessId = user.businessId
  const currentUserId = user.id

  const targetUserId = (formData.get('userId') as string | null)?.trim() ?? ''
  if (!targetUserId) return { success: false, error: 'User ID is required' }
  if (targetUserId === currentUserId)
    return { success: false, error: 'You cannot deactivate your own account' }

  // IDOR guard
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.businessId, businessId)))
  if (!target) return { success: false, error: 'User not found' }

  await db
    .update(users)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(users.id, targetUserId))

  return { success: true }
}

export async function reactivateTeamMember(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireRole(['owner'])
  const businessId = user.businessId

  const targetUserId = (formData.get('userId') as string | null)?.trim() ?? ''
  if (!targetUserId) return { success: false, error: 'User ID is required' }

  // IDOR guard
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.businessId, businessId)))
  if (!target) return { success: false, error: 'User not found' }

  await db
    .update(users)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(users.id, targetUserId))

  return { success: true }
}

// ─── Chart of Accounts — Add Account ─────────────────────────────────────────

export async function addAccount(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireRole(['owner'])
  const businessId = user.businessId

  const code = (formData.get('code') as string | null)?.trim() ?? ''
  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const type = (formData.get('type') as string | null)?.trim() ?? ''
  const subtype = (formData.get('subtype') as string | null)?.trim() || null
  const cashFlowActivity =
    (formData.get('cashFlowActivity') as string | null)?.trim() || 'operating'

  const fieldErrors: Record<string, string> = {}
  if (!code) fieldErrors.code = 'Account code is required'
  if (!name) fieldErrors.name = 'Account name is required'
  if (!VALID_ACCOUNT_TYPES.includes(type as (typeof VALID_ACCOUNT_TYPES)[number]))
    fieldErrors.type = 'Select a valid account type'
  if (
    !VALID_CASH_FLOW_ACTIVITIES.includes(
      cashFlowActivity as (typeof VALID_CASH_FLOW_ACTIVITIES)[number],
    )
  )
    fieldErrors.cashFlowActivity = 'Select a valid cash flow activity'

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  // Check code uniqueness within this business
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, code)))
  if (existing)
    return {
      success: false,
      error: 'Account code already exists',
      fieldErrors: { code: 'This code is already in use' },
    }

  await db.insert(accounts).values({
    businessId,
    code,
    name,
    type,
    subtype,
    cashFlowActivity,
    isSystem: false,
    currency: 'GHS',
  })

  return { success: true }
}

// ─── Account — Change Password ────────────────────────────────────────────────

export async function changePassword(
  _prevState: SettingsActionResult,
  formData: FormData,
): Promise<SettingsActionResult> {
  // All authenticated roles can change their own password
  await requireRole(['owner', 'manager', 'accountant', 'cashier'])

  const newPassword = (formData.get('newPassword') as string | null) ?? ''
  const confirmPassword = (formData.get('confirmPassword') as string | null) ?? ''

  const fieldErrors: Record<string, string> = {}
  if (newPassword.length < 8) fieldErrors.newPassword = 'Password must be at least 8 characters'
  if (newPassword !== confirmPassword) fieldErrors.confirmPassword = 'Passwords do not match'

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
