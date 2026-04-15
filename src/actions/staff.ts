'use server'

import { and, asc, eq, ne } from 'drizzle-orm'
import { db } from '@/db'
import { staff, payrollLines, payrollRuns } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateStaffInput = {
  fullName: string
  phone?: string
  roleTitle?: string
  salaryType?: 'monthly' | 'daily' | 'hourly'
  baseSalary?: number
  ssnitNumber?: string
  tin?: string
  bankName?: string
  bankAccount?: string
  momoNumber?: string
  startDate?: string
}

export type UpdateStaffInput = Partial<CreateStaffInput>

export type StaffListItem = {
  id: string
  fullName: string
  phone: string | null
  roleTitle: string | null
  salaryType: string | null
  baseSalary: string | null
  isActive: boolean
  startDate: string | null
}

export type StaffDetail = {
  id: string
  businessId: string
  userId: string | null
  fullName: string
  phone: string | null
  roleTitle: string | null
  salaryType: string | null
  baseSalary: string | null
  ssnitNumber: string | null
  tin: string | null
  bankName: string | null
  bankAccount: string | null
  momoNumber: string | null
  startDate: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function createStaff(input: CreateStaffInput): Promise<{ staffId: string }> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  const fullName = input.fullName?.trim() ?? ''
  if (!fullName) throw new Error('Full name is required.')

  if (input.phone) {
    const existing = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.businessId, businessId), eq(staff.phone, input.phone)))
      .limit(1)

    if (existing.length > 0) {
      throw new Error(`A staff member with phone ${input.phone} already exists.`)
    }
  }

  const [record] = await db
    .insert(staff)
    .values({
      businessId,
      fullName,
      phone: input.phone ?? null,
      roleTitle: input.roleTitle ?? null,
      salaryType: input.salaryType ?? null,
      baseSalary: input.baseSalary != null ? String(input.baseSalary) : null,
      ssnitNumber: input.ssnitNumber ?? null,
      tin: input.tin ?? null,
      bankName: input.bankName ?? null,
      bankAccount: input.bankAccount ?? null,
      momoNumber: input.momoNumber ?? null,
      startDate: input.startDate ?? null,
    })
    .returning({ id: staff.id })

  return { staffId: record.id }
}

export async function updateStaff(staffId: string, input: UpdateStaffInput): Promise<void> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  const existing = await db
    .select({ id: staff.id, phone: staff.phone })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.businessId, businessId)))
    .limit(1)

  if (existing.length === 0) throw new Error('Staff member not found')

  if (input.phone && input.phone !== existing[0].phone) {
    const duplicate = await db
      .select({ id: staff.id })
      .from(staff)
      .where(
        and(
          eq(staff.businessId, businessId),
          eq(staff.phone, input.phone),
          ne(staff.id, staffId),
        ),
      )
      .limit(1)

    if (duplicate.length > 0) {
      throw new Error(`A staff member with phone ${input.phone} already exists.`)
    }
  }

  await db
    .update(staff)
    .set({
      ...(input.fullName !== undefined && { fullName: input.fullName.trim() }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.roleTitle !== undefined && { roleTitle: input.roleTitle }),
      ...(input.salaryType !== undefined && { salaryType: input.salaryType }),
      ...(input.baseSalary !== undefined && { baseSalary: String(input.baseSalary) }),
      ...(input.ssnitNumber !== undefined && { ssnitNumber: input.ssnitNumber }),
      ...(input.tin !== undefined && { tin: input.tin }),
      ...(input.bankName !== undefined && { bankName: input.bankName }),
      ...(input.bankAccount !== undefined && { bankAccount: input.bankAccount }),
      ...(input.momoNumber !== undefined && { momoNumber: input.momoNumber }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      updatedAt: new Date(),
    })
    .where(eq(staff.id, staffId))
}

export async function deactivateStaff(staffId: string): Promise<void> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  const existing = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.businessId, businessId)))
    .limit(1)

  if (existing.length === 0) throw new Error('Staff member not found')

  const unpaidLines = await db
    .select({ id: payrollLines.id })
    .from(payrollLines)
    .innerJoin(payrollRuns, eq(payrollLines.payrollRunId, payrollRuns.id))
    .where(
      and(
        eq(payrollLines.staffId, staffId),
        eq(payrollRuns.businessId, businessId),
        eq(payrollRuns.status, 'approved'),
        eq(payrollLines.isPaid, false),
      ),
    )
    .limit(1)

  if (unpaidLines.length > 0) {
    throw new Error('Cannot deactivate staff with unpaid approved payroll lines.')
  }

  await db
    .update(staff)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(staff.id, staffId))
}

export async function listStaff(filters?: { isActive?: boolean }): Promise<StaffListItem[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  const conditions = [eq(staff.businessId, businessId)]
  if (filters?.isActive !== undefined) {
    conditions.push(eq(staff.isActive, filters.isActive))
  }

  return db
    .select({
      id: staff.id,
      fullName: staff.fullName,
      phone: staff.phone,
      roleTitle: staff.roleTitle,
      salaryType: staff.salaryType,
      baseSalary: staff.baseSalary,
      isActive: staff.isActive,
      startDate: staff.startDate,
    })
    .from(staff)
    .where(and(...conditions))
    .orderBy(asc(staff.fullName))
}

export async function getStaffById(staffId: string): Promise<StaffDetail> {
  const session = await getServerSession()
  const { businessId } = session.user

  const rows = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.businessId, businessId)))
    .limit(1)

  if (rows.length === 0) throw new Error('Staff member not found')

  return rows[0] as StaffDetail
}
