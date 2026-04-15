'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Edit2, AlertTriangle } from 'lucide-react'
import type { StaffDetail } from '@/actions/staff'
import { deactivateStaff } from '@/actions/staff'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import { avatarColor, initials } from '@/lib/format'

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex justify-between border-b border-gray-100 py-3 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  )
}

export default function StaffDetailView({ member }: { member: StaffDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)

  function formatSalary() {
    if (!member.baseSalary) return null
    const amount = parseFloat(member.baseSalary).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    const period =
      member.salaryType === 'daily' ? '/ day' : member.salaryType === 'hourly' ? '/ hr' : '/ mo'
    return `GHS ${amount} ${period}`
  }

  function handleDeactivate() {
    setError(null)
    startTransition(async () => {
      try {
        await deactivateStaff(member.id)
        router.push('/staff')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not deactivate staff member.')
        setShowDeactivateConfirm(false)
      }
    })
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Staff Profile"
          backHref="/staff"
          actions={
            <Button render={<Link href={`/staff/${member.id}/edit`} />} variant="outline" size="sm">
              <Edit2 className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          }
        />

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Profile card */}
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="mb-6 flex items-center gap-4">
            <Avatar className={`h-14 w-14 shrink-0 ${avatarColor(member.fullName)}`}>
              <AvatarFallback className="text-lg font-semibold text-white">
                {initials(member.fullName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{member.fullName}</h2>
              {member.roleTitle && <p className="text-sm text-gray-500">{member.roleTitle}</p>}
              <Badge
                className="mt-1"
                variant={member.isActive ? 'default' : 'secondary'}
              >
                {member.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          <DetailRow label="Phone" value={member.phone} />
          <DetailRow label="Salary" value={formatSalary()} />
          <DetailRow
            label="Salary Type"
            value={
              member.salaryType
                ? member.salaryType.charAt(0).toUpperCase() + member.salaryType.slice(1)
                : null
            }
          />
          <DetailRow label="Start Date" value={member.startDate} />
          <DetailRow label="SSNIT Number" value={member.ssnitNumber} />
          <DetailRow label="TIN" value={member.tin} />
          <DetailRow label="MoMo Number" value={member.momoNumber} />
          <DetailRow label="Bank Name" value={member.bankName} />
          <DetailRow label="Bank Account" value={member.bankAccount} />
        </div>

        {/* Payroll history placeholder */}
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Payroll History
          </h3>
          <p className="text-sm text-gray-400">
            Payroll runs will appear here once Sprint 11 Task 2 is complete.
          </p>
        </div>

        {/* Deactivate */}
        {member.isActive && (
          <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-500">
              Danger Zone
            </h3>
            {!showDeactivateConfirm ? (
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => setShowDeactivateConfirm(true)}
              >
                Deactivate Staff Member
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-sm text-amber-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    This will mark the staff member as inactive. You can reactivate them by
                    editing their profile. This cannot be done if they have unpaid payroll.
                  </span>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeactivateConfirm(false)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeactivate}
                    disabled={isPending}
                  >
                    {isPending ? 'Deactivating...' : 'Confirm Deactivate'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
