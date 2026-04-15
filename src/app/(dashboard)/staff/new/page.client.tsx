'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStaff, updateStaff, type StaffDetail, type UpdateStaffInput } from '@/actions/staff'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

type StaffFormProps =
  | { businessId: string; mode: 'create'; initialData?: undefined }
  | { businessId: string; mode: 'edit'; initialData: StaffDetail }

export default function StaffForm({ businessId: _businessId, mode, initialData }: StaffFormProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // ─── Controlled form state ─────────────────────────────────────────────────
  const [fullName, setFullName] = useState(initialData?.fullName ?? '')
  const [phone, setPhone] = useState(initialData?.phone ?? '')
  const [roleTitle, setRoleTitle] = useState(initialData?.roleTitle ?? '')
  const [salaryType, setSalaryType] = useState<'monthly' | 'daily' | 'hourly'>(
    (initialData?.salaryType as 'monthly' | 'daily' | 'hourly') ?? 'monthly',
  )
  const [baseSalary, setBaseSalary] = useState(
    initialData?.baseSalary ? String(parseFloat(initialData.baseSalary)) : '',
  )
  const [ssnitNumber, setSsnitNumber] = useState(initialData?.ssnitNumber ?? '')
  const [tin, setTin] = useState(initialData?.tin ?? '')
  const [bankName, setBankName] = useState(initialData?.bankName ?? '')
  const [bankAccount, setBankAccount] = useState(initialData?.bankAccount ?? '')
  const [momoNumber, setMomoNumber] = useState(initialData?.momoNumber ?? '')
  const [startDate, setStartDate] = useState(initialData?.startDate ?? '')

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createStaff({
            fullName,
            phone: phone || undefined,
            roleTitle: roleTitle || undefined,
            salaryType,
            baseSalary: baseSalary ? parseFloat(baseSalary) : undefined,
            ssnitNumber: ssnitNumber || undefined,
            tin: tin || undefined,
            bankName: bankName || undefined,
            bankAccount: bankAccount || undefined,
            momoNumber: momoNumber || undefined,
            startDate: startDate || undefined,
          })
        } else {
          const updates: UpdateStaffInput = {
            fullName,
            phone: phone || undefined,
            roleTitle: roleTitle || undefined,
            salaryType,
            baseSalary: baseSalary ? parseFloat(baseSalary) : undefined,
            ssnitNumber: ssnitNumber || undefined,
            tin: tin || undefined,
            bankName: bankName || undefined,
            bankAccount: bankAccount || undefined,
            momoNumber: momoNumber || undefined,
            startDate: startDate || undefined,
          }
          await updateStaff(initialData.id, updates)
        }
        router.push('/staff')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      }
    })
  }

  const inputClass = 'h-11 text-base'
  const labelClass = 'text-sm font-medium text-gray-700'

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === 'create' ? 'Add Staff Member' : 'Edit Staff Member'}
        backHref="/staff"
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Personal Details
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Full Name */}
          <div className="md:col-span-2">
            <Label className={labelClass}>
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Kwame Mensah"
            />
          </div>

          {/* Phone */}
          <div>
            <Label className={labelClass}>Phone</Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0244000001"
              type="tel"
            />
          </div>

          {/* Role Title */}
          <div>
            <Label className={labelClass}>Role / Job Title</Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. Sales Manager"
            />
          </div>

          {/* Start Date */}
          <div>
            <Label className={labelClass}>
              Start Date <span className="text-red-500">*</span>
            </Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Salary</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Salary Type */}
          <div>
            <Label className={labelClass}>
              Salary Type <span className="text-red-500">*</span>
            </Label>
            <select
              className={cn(
                inputClass,
                'mt-1 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring',
              )}
              value={salaryType}
              onChange={(e) => setSalaryType(e.target.value as 'monthly' | 'daily' | 'hourly')}
            >
              <option value="monthly">Monthly</option>
              <option value="daily">Daily</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>

          {/* Base Salary */}
          <div>
            <Label className={labelClass}>
              Base Salary (GHS) <span className="text-red-500">*</span>
            </Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              type="number"
              min="0"
              step="0.01"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Tax &amp; Compliance
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className={labelClass}>SSNIT Number</Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              value={ssnitNumber}
              onChange={(e) => setSsnitNumber(e.target.value)}
              placeholder="Optional — can be added later"
            />
          </div>
          <div>
            <Label className={labelClass}>TIN</Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              value={tin}
              onChange={(e) => setTin(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Payment Details
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className={labelClass}>MoMo Number</Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              value={momoNumber}
              onChange={(e) => setMomoNumber(e.target.value)}
              placeholder="e.g. 0244000001"
              type="tel"
            />
          </div>
          <div>
            <Label className={labelClass}>Bank Name</Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. GCB Bank"
            />
          </div>
          <div className="md:col-span-2">
            <Label className={labelClass}>Bank Account Number</Label>
            <Input
              className={cn(inputClass, 'mt-1')}
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3 pb-8">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.push('/staff')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Saving...' : mode === 'create' ? 'Add Staff Member' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
