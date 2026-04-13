'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Package } from 'lucide-react'
import type { GrnWithSupplier } from '@/actions/grn'
import { formatGhs, formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'

type GrnStatus = 'all' | 'draft' | 'confirmed'

const STATUS_TABS: { key: GrnStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'confirmed', label: 'Confirmed' },
]

const STATUS_VARIANT: Record<string, 'draft' | 'approved'> = {
  draft: 'draft',
  confirmed: 'approved',
}

export default function GrnList({ initialGrns }: { initialGrns: GrnWithSupplier[] }) {
  const [activeTab, setActiveTab] = useState<GrnStatus>('all')
  const [search, setSearch] = useState('')

  const filtered = initialGrns.filter((g) => {
    if (activeTab !== 'all' && g.status !== activeTab) return false
    if (search) {
      const term = search.toLowerCase()
      return g.grnNumber.toLowerCase().includes(term) || g.supplierName.toLowerCase().includes(term)
    }
    return true
  })

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Goods Received"
        actions={
          <Button render={<Link href="/grn/new" />}>
            + New GRN
          </Button>
        }
      />

      {/* Search */}
      <SearchInput
        placeholder="Search by GRN number or supplier..."
        value={search}
        onChange={setSearch}
      />

      {/* Status tabs */}
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
            className="shrink-0 rounded-full"
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* List */}
      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          search ? (
            <EmptyState
              icon={<Package className="h-10 w-10" />}
              title="No GRNs match your search"
            />
          ) : (
            <EmptyState
              icon={<Package className="h-10 w-10" />}
              title="No goods received notes yet"
              subtitle="Record a walk-in delivery or receive goods against a PO."
              action={{ label: 'Record Delivery', href: '/grn/new' }}
            />
          )
        ) : (
          filtered.map((grn) => (
            <Link key={grn.id} href={`/grn/${grn.id}`}>
              <Card className="flex items-center justify-between p-4 transition-shadow hover:shadow-md">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">
                      {grn.grnNumber}
                    </span>
                    <StatusBadge variant={STATUS_VARIANT[grn.status] ?? 'draft'}>
                      {grn.status === 'confirmed' ? 'Confirmed' : 'Draft'}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{grn.supplierName}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(grn.receivedDate)}</p>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">{formatGhs(grn.totalCost)}</p>
                  {grn.poId && <p className="text-xs text-muted-foreground">From PO</p>}
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
