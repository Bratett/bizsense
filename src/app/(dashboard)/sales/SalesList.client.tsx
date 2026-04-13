'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Download, Eye, Pencil, Plus, Receipt } from 'lucide-react'
import {
  listSales,
  type SalesSummary,
  type SalesListResult,
  type SalesListFilters,
} from '@/actions/sales'

import { formatGhs, formatDate, avatarColor, initials } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function getTrendPercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100)
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all', label: 'All Sales' },
  { key: 'paid', label: 'Paid' },
  { key: 'unpaid', label: 'Pending' },
  { key: 'overdue', label: 'Overdue' },
] as const

const STATUS_MAP: Record<string, 'paid' | 'partial' | 'unpaid' | 'overdue' | 'cancelled'> = {
  paid: 'paid',
  partial: 'partial',
  unpaid: 'unpaid',
  overdue: 'overdue',
  cancelled: 'cancelled',
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'PAID',
  partial: 'PARTIAL',
  unpaid: 'PENDING',
  overdue: 'OVERDUE',
  cancelled: 'CANCELLED',
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SalesList({
  initialSales,
  summary,
}: {
  initialSales: SalesListResult
  summary: SalesSummary
}) {
  const [sales, setSales] = useState(initialSales)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('all')
  const [isPending, startTransition] = useTransition()

  const customerTrend = getTrendPercent(summary.totalCustomers, summary.customerCountLastMonth)

  const fetchSales = (overrides: Partial<SalesListFilters> = {}) => {
    const filters: SalesListFilters = {
      search: overrides.search ?? search,
      paymentStatus:
        (overrides.paymentStatus ?? activeTab) === 'all'
          ? undefined
          : ((overrides.paymentStatus ?? activeTab) as SalesListFilters['paymentStatus']),
      page: overrides.page ?? 1,
      pageSize: 20,
    }
    startTransition(async () => {
      const result = await listSales(filters)
      setSales(result)
    })
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    fetchSales({
      paymentStatus: tab === 'all' ? undefined : (tab as SalesListFilters['paymentStatus']),
      page: 1,
    })
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    fetchSales({ search: value, page: 1 })
  }

  const handlePageChange = (newPage: number) => {
    fetchSales({ page: newPage })
  }

  const handleExportCSV = () => {
    const headers = ['Date', 'Order #', 'Customer', 'Items', 'Total (GHS)', 'Status']
    const csvRows = sales.items.map((s) => [
      s.orderDate,
      s.orderNumber,
      s.customerName ?? 'Walk-in',
      s.itemCount,
      s.totalAmount ?? '0',
      s.paymentStatus,
    ])
    const csv = [headers, ...csvRows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sales-export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(sales.totalCount / sales.pageSize)
  const showFrom = (sales.page - 1) * sales.pageSize + 1
  const showTo = Math.min(sales.page * sales.pageSize, sales.totalCount)

  // Determine if row is overdue
  const isOverdue = (item: (typeof sales.items)[0]) => {
    if (item.paymentStatus === 'paid' || item.status === 'cancelled') return false
    const orderDate = new Date(item.orderDate + 'T00:00:00')
    const daysSince = Math.floor((Date.now() - orderDate.getTime()) / 86400000)
    return daysSince > 30
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl p-4 md:p-8">
        <PageHeader
          title="Sales"
          subtitle="Manage and track all business transactions"
          actions={
            <div className="flex items-center gap-3">
              <SearchInput
                value={search}
                onChange={handleSearch}
                placeholder="Search orders, customers..."
                className="w-full md:w-72"
              />
              <Button size="lg" render={<Link href="/orders/new" />}>
                <Plus className="h-4 w-4" />
                New Sale
              </Button>
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total Sales This Month
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                {formatGhs(summary.totalSalesThisMonth)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pending Payments
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-destructive">
                {formatGhs(summary.pendingPayments)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Total Customers
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                    {summary.totalCustomers.toLocaleString()}
                  </p>
                </div>
                {customerTrend !== null && (
                  <span
                    className={cn(
                      'mt-1 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
                      customerTrend >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
                    )}
                  >
                    {customerTrend >= 0 ? '\u2197' : '\u2198'} {Math.abs(customerTrend)}%
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs + Actions */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={activeTab}
            onValueChange={(val) => handleTabChange(val as string)}
            className="flex-row"
          >
            <TabsList>
              {TABS.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Button variant="outline" size="lg" onClick={handleExportCSV}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Data Table */}
        <Card>
          <CardContent className="relative p-0">
            {isPending && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-700 border-t-transparent" />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total (GHS)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="px-4 py-16">
                      <EmptyState
                        icon={<Receipt className="h-12 w-12" />}
                        title="No sales yet"
                        subtitle="Record your first sale to get started"
                        action={{ label: 'Record your first sale', href: '/orders/new' }}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.items.map((item) => {
                    const overdue = isOverdue(item)
                    const displayStatus = overdue ? 'overdue' : item.paymentStatus
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="text-muted-foreground">
                          {formatDate(item.orderDate)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.orderNumber}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar>
                              <AvatarFallback className={cn(avatarColor(item.customerName), 'text-white text-xs')}>
                                {initials(item.customerName ?? '?')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium truncate max-w-[140px]">
                              {item.customerName ?? 'Walk-in'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.itemCount} item{item.itemCount !== 1 ? 's' : ''}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatGhs(item.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={STATUS_MAP[displayStatus] ?? 'cancelled'}>
                            {STATUS_LABELS[displayStatus] ?? displayStatus.toUpperCase()}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" render={<Link href={`/sales/${item.id}`} title="View" />}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" render={<Link href={`/sales/${item.id}`} title="Edit" />}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {sales.totalCount > 0 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Showing {showFrom} to {showTo} of {sales.totalCount} results
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(sales.page - 1)}
                    disabled={sales.page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(sales.page + 1)}
                    disabled={sales.page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
