'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import type { ValuationReport } from '@/lib/inventory/valuation'
import { formatGhs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatDateObj(date: Date): string {
  return new Date(date).toLocaleDateString('en-GH', { dateStyle: 'medium' })
}

type SortKey = 'value' | 'name' | 'category' | 'quantity'
type SortDir = 'asc' | 'desc'

// ─── Component ──────────────────────────────────────────────────────────────

export default function ValuationReportView({ report }: { report: ValuationReport }) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'category' ? 'asc' : 'desc')
    }
  }

  const filtered = report.lines
    .filter((l) => {
      if (showLowStockOnly && !l.isLowStock) return false
      if (search) {
        const term = search.toLowerCase()
        return (
          l.productName.toLowerCase().includes(term) ||
          (l.sku?.toLowerCase().includes(term) ?? false)
        )
      }
      return true
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'value':
          return (a.totalValue - b.totalValue) * dir
        case 'name':
          return a.productName.localeCompare(b.productName) * dir
        case 'category':
          return (a.category ?? '').localeCompare(b.category ?? '') * dir
        case 'quantity':
          return (a.currentQuantity - b.currentQuantity) * dir
        default:
          return 0
      }
    })

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <PageHeader
        title="Stock Valuation Report"
        subtitle={`As at ${formatDateObj(report.generatedAt)}`}
        actions={
          <Button variant="link" render={<Link href="/inventory" />}>
            Back to Inventory
          </Button>
        }
      />

      {/* Summary card */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Inventory Value</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatGhs(report.grandTotalValue)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Products</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {report.lines.length}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Low Stock</p>
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  report.lowStockCount > 0 ? 'text-amber-600' : 'text-green-700'
                }`}
              >
                {report.lowStockCount}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">GL Balance (1200)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatGhs(report.glAccountBalance)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reconciliation check */}
      <div className="mt-3">
        {report.isReconciled ? (
          <Alert>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <span className="font-medium text-green-800">Reconciled</span>
              <span className="ml-2 text-xs text-green-600">
                Valuation matches GL account 1200 (Inventory)
              </span>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">
                Discrepancy: {formatGhs(Math.abs(report.discrepancy))}
              </span>
              <Link
                href="/ledger"
                className="ml-auto text-xs font-medium underline hover:text-destructive"
              >
                Run integrity check
              </Link>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Search + filter bar */}
      <div className="mt-4 flex gap-2">
        <SearchInput
          placeholder="Search by name or SKU..."
          value={search}
          onChange={setSearch}
          className="flex-1"
        />
        <Button
          variant={showLowStockOnly ? 'default' : 'outline'}
          onClick={() => setShowLowStockOnly((v) => !v)}
          className={showLowStockOnly ? 'bg-amber-600 hover:bg-amber-700' : ''}
        >
          Low Stock
        </Button>
      </div>

      {/* Table */}
      <Card className="mt-4">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead
                className="cursor-pointer px-4 hover:text-foreground"
                onClick={() => toggleSort('name')}
              >
                Product{sortIndicator('name')}
              </TableHead>
              <TableHead className="hidden px-4 md:table-cell">SKU</TableHead>
              <TableHead
                className="hidden cursor-pointer px-4 hover:text-foreground md:table-cell"
                onClick={() => toggleSort('category')}
              >
                Category{sortIndicator('category')}
              </TableHead>
              <TableHead
                className="cursor-pointer px-4 text-right hover:text-foreground"
                onClick={() => toggleSort('quantity')}
              >
                Qty{sortIndicator('quantity')}
              </TableHead>
              <TableHead className="hidden px-4 text-right md:table-cell">Unit</TableHead>
              <TableHead className="hidden px-4 text-right md:table-cell">FIFO Cost</TableHead>
              <TableHead
                className="cursor-pointer px-4 text-right hover:text-foreground"
                onClick={() => toggleSort('value')}
              >
                Value{sortIndicator('value')}
              </TableHead>
              <TableHead className="px-4 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No products match your filters
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((line) => (
                <TableRow key={line.productId}>
                  <TableCell className="px-4 font-medium text-foreground">
                    <Link href={`/inventory/${line.productId}`} className="hover:text-primary">
                      {line.productName}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden px-4 text-muted-foreground md:table-cell">
                    {line.sku ?? '-'}
                  </TableCell>
                  <TableCell className="hidden px-4 text-muted-foreground md:table-cell">
                    {line.category ?? '-'}
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums text-foreground">
                    {line.currentQuantity}
                  </TableCell>
                  <TableCell className="hidden px-4 text-right text-muted-foreground md:table-cell">
                    {line.unit ?? '-'}
                  </TableCell>
                  <TableCell className="hidden px-4 text-right tabular-nums text-foreground md:table-cell">
                    {line.fifoUnitCost > 0 ? formatGhs(line.fifoUnitCost) : '-'}
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums font-medium text-foreground">
                    {line.totalValue > 0 ? `${formatGhs(line.totalValue)}` : '-'}
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    {line.isLowStock ? (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
                        Low
                      </Badge>
                    ) : line.currentQuantity <= 0 ? (
                      <Badge variant="destructive">Out</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                        OK
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Footer links */}
      <div className="mt-4 pb-4 text-sm">
        <Button variant="link" render={<Link href="/ledger" />} className="px-0">
          View Inventory account in General Ledger &rarr;
        </Button>
      </div>
    </div>
  )
}
