'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Users } from 'lucide-react'
import type { StaffListItem } from '@/actions/staff'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { avatarColor, initials } from '@/lib/format'

export default function StaffList({
  businessId: _businessId,
  initialStaff,
}: {
  businessId: string
  initialStaff: StaffListItem[]
}) {
  const [search, setSearch] = useState('')

  const filtered = initialStaff.filter((s) => {
    if (!search) return true
    const term = search.toLowerCase()
    return (
      s.fullName.toLowerCase().includes(term) ||
      (s.phone && s.phone.includes(term)) ||
      (s.roleTitle && s.roleTitle.toLowerCase().includes(term))
    )
  })

  function formatSalary(item: StaffListItem) {
    if (!item.baseSalary) return null
    const amount = parseFloat(item.baseSalary).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    const period =
      item.salaryType === 'daily' ? '/ day' : item.salaryType === 'hourly' ? '/ hr' : '/ mo'
    return `GHS ${amount} ${period}`
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Staff"
          subtitle={`${initialStaff.length} active staff member${initialStaff.length !== 1 ? 's' : ''}`}
          actions={
            <Button render={<Link href="/staff/new" />} size="lg">
              Add Staff
            </Button>
          }
        />

        <div className="mt-6">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, phone, or role..."
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={search ? 'No staff match your search' : 'No staff members yet'}
            subtitle={
              search
                ? 'Try a different search term.'
                : 'Add your first staff member to get started.'
            }
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {filtered.map((member) => (
              <li key={member.id}>
                <Link
                  href={`/staff/${member.id}`}
                  className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 transition hover:shadow-md"
                >
                  <Avatar className={`h-10 w-10 shrink-0 ${avatarColor(member.fullName)}`}>
                    <AvatarFallback className="text-sm font-medium text-white">
                      {initials(member.fullName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">{member.fullName}</p>
                    {member.roleTitle && (
                      <p className="truncate text-sm text-gray-500">{member.roleTitle}</p>
                    )}
                    {formatSalary(member) && (
                      <p className="text-sm text-gray-500">{formatSalary(member)}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={member.isActive ? 'default' : 'secondary'}>
                      {member.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
