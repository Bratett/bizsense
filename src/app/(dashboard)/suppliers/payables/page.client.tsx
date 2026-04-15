'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type {
  PayablesAgingReport,
  SupplierAgingRow,
  AllocatedGrn,
} from '@/lib/suppliers/payablesAging'
import { recordSupplierPayment, type PaymentMethod } from '@/actions/supplierPayments'

import { formatGhs, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import {
  Filter,
  Download,
  Banknote,
  FileText,
  X,
  Calendar,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

const BUCKET_BADGE_COLORS = {
  current: 'bg-green-100 text-green-700',
  '31-60': 'bg-amber-100 text-amber-700',
  '61-90': 'bg-orange-100 text-orange-700',
  over90: 'bg-red-100 text-red-700',
} as const

const BUCKET_BAR_COLORS = {
  current: 'bg-gray-800',
  '31-60': 'bg-amber-400',
  '61-90': 'bg-orange-500',
  over90: 'bg-red-500',
} as const

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel Cash',
  momo_airtel: 'AirtelTigo Money',
  bank: 'Bank Transfer',
}

// --- Payment Modal ---

type PaymentModalProps = {
  supplier: SupplierAgingRow
  onClose: () => void
  onSuccess: () => void
}

function PaymentModal({ supplier, onClose, onSuccess }: PaymentModalProps) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(todayISO())
  const [momoRef, setMomoRef] = useState('')
  const [bankRef, setBankRef] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  const outstanding = supplier.totals.total
  const amountNum = parseFloat(amount)

  function handleSubmit() {
    setError(null)
    setWarning(null)

    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Enter a valid amount greater than 0')
      return
    }

    if (amountNum > outstanding && !awaitingConfirm) {
      setWarning(
        `This payment (${formatGhs(amountNum)}) exceeds the outstanding balance (${formatGhs(outstanding)}). This will create a supplier credit. Continue?`,
      )
      setAwaitingConfirm(true)
      return
    }

    startTransition(async () => {
      try {
        await recordSupplierPayment({
          supplierId: supplier.supplierId,
          amount: amountNum,
          paymentMethod: method,
          paymentDate: date,
          momoReference: momoRef || undefined,
          bankReference: bankRef || undefined,
          notes: notes || undefined,
        })
        onSuccess()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to record payment')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Record Payment</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">
            Supplier: <span className="font-medium text-foreground">{supplier.supplierName}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              Outstanding: {formatGhs(outstanding)}
            </span>
          </p>

          {warning && (
            <Alert className="mb-4 border-amber-200 bg-amber-50">
              <AlertDescription className="text-amber-800">{warning}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount (GHS)</Label>
              <Input
                type="text"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setAwaitingConfirm(false)
                  setWarning(null)
                }}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Payment Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {(method === 'momo_mtn' || method === 'momo_telecel' || method === 'momo_airtel') && (
              <div className="space-y-1.5">
                <Label>MoMo Reference</Label>
                <Input
                  type="text"
                  value={momoRef}
                  onChange={(e) => setMomoRef(e.target.value)}
                  placeholder="Transaction ID"
                />
              </div>
            )}

            {method === 'bank' && (
              <div className="space-y-1.5">
                <Label>Bank Reference</Label>
                <Input
                  type="text"
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value)}
                  placeholder="Bank transaction reference"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 resize-none md:text-sm"
                placeholder="Any additional notes..."
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Saving...' : awaitingConfirm ? 'Confirm Payment' : 'Record Payment'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// --- GRN Row ---

function GrnRow({ grn }: { grn: AllocatedGrn }) {
  const badgeClass = BUCKET_BADGE_COLORS[grn.bucket]
  return (
    <TableRow>
      <TableCell className="pl-10 text-xs text-muted-foreground">{grn.grnNumber}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(grn.receivedDate)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatDate(grn.dueDate)}</TableCell>
      <TableCell className="text-right text-xs text-foreground">
        {formatGhs(grn.originalAmount)}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {grn.amountPaid > 0 ? `${formatGhs(grn.amountPaid)}` : '\u2014'}
      </TableCell>
      <TableCell className="text-right text-xs font-medium text-foreground">
        {formatGhs(grn.outstanding)}
      </TableCell>
      <TableCell className="text-right">
        <Badge variant="secondary" className={cn('text-[10px]', badgeClass)}>
          {grn.ageInDays === 0 ? 'Current' : `${grn.ageInDays}d`}
        </Badge>
      </TableCell>
    </TableRow>
  )
}

// --- Supplier Row ---

function SupplierRow({
  row,
  onRecordPayment,
}: {
  row: SupplierAgingRow
  onRecordPayment: (s: SupplierAgingRow) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const isCritical = row.totals.over90 > 0
  const over90Class = row.totals.over90 > 0 ? 'text-red-600 font-semibold' : 'text-foreground'
  const supplierInitials = row.supplierName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <TableCell className="py-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                isCritical ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800',
              )}
            >
              {supplierInitials}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{row.supplierName}</p>
              {row.phone && <p className="text-xs text-muted-foreground">{row.phone}</p>}
            </div>
            <span
              className={cn(
                'ml-1 h-2 w-2 rounded-full',
                isCritical ? 'bg-red-500' : 'bg-green-500',
              )}
            />
          </div>
        </TableCell>
        <TableCell className="text-right text-sm font-medium text-foreground">
          {formatGhs(row.totals.total)}
        </TableCell>
        <TableCell className="text-right text-sm text-foreground">
          {row.totals.current > 0 ? `${formatGhs(row.totals.current)}` : '\u2014'}
        </TableCell>
        <TableCell className="text-right text-sm text-amber-600">
          {row.totals.days31to60 > 0 ? `${formatGhs(row.totals.days31to60)}` : '\u2014'}
        </TableCell>
        <TableCell className="text-right text-sm text-orange-600">
          {row.totals.days61to90 > 0 ? `${formatGhs(row.totals.days61to90)}` : '\u2014'}
        </TableCell>
        <TableCell className={cn('text-right text-sm', over90Class)}>
          {row.totals.over90 > 0 ? (
            <span className="rounded-md bg-red-50 px-2 py-0.5">{formatGhs(row.totals.over90)}</span>
          ) : (
            '\u2014'
          )}
        </TableCell>
        <TableCell>
          <div className="flex justify-end gap-2">
            <Button
              size="xs"
              onClick={(e) => {
                e.stopPropagation()
                onRecordPayment(row)
              }}
            >
              <Banknote className="h-3.5 w-3.5" />
              Pay
            </Button>
            <Button
              variant="outline"
              size="xs"
              render={<Link href={`/suppliers/${row.supplierId}`} />}
              onClick={(e) => e.stopPropagation()}
            >
              <FileText className="h-3 w-3" />
              Statement
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && row.grns.map((grn) => <GrnRow key={grn.grnId} grn={grn} />)}
    </>
  )
}

// --- Main Component ---

export default function PayablesAgingClient({ report }: { report: PayablesAgingReport }) {
  const router = useRouter()
  const [paymentTarget, setPaymentTarget] = useState<SupplierAgingRow | null>(null)
  const gt = report.grandTotals
  const totalForPct = gt.total || 1

  // Find largest over-90 supplier for advisory
  const criticalSupplier = report.suppliers.reduce<SupplierAgingRow | null>(
    (max, s) => (!max || s.totals.over90 > max.totals.over90 ? s : max),
    null,
  )

  const asAt = report.generatedAt.toLocaleDateString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {paymentTarget && (
        <PaymentModal
          supplier={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            setPaymentTarget(null)
            router.refresh()
          }}
        />
      )}

      <div className="mx-auto max-w-6xl p-4 md:p-8">
        {/* Header */}
        <PageHeader
          title="Payables Aging Report"
          subtitle="Comprehensive breakdown of outstanding vendor obligations, categorized by duration to manage cash flow effectively."
          backHref="/suppliers"
          actions={
            <div className="flex gap-2">
              <Button variant="outline">
                <Filter className="h-4 w-4" />
                Filter Dates
              </Button>
              <Button variant="outline">
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {/* Total Owed */}
          <div className="col-span-2 md:col-span-1 rounded-xl bg-green-800 p-4 text-white shadow-sm">
            <p className="text-xs font-medium text-green-200">TOTAL OWED</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatGhs(gt.total)}</p>
            {gt.over90 > 0 && (
              <p className="mt-2 text-xs text-green-300">
                {'\u25B2'} {((gt.over90 / totalForPct) * 100).toFixed(1)}% overdue 90+
              </p>
            )}
          </div>

          {/* 1-30 Days */}
          <SummaryBucket
            label="1-30 DAYS"
            amount={gt.current}
            total={totalForPct}
            barColor={BUCKET_BAR_COLORS.current}
            valueColor="text-foreground"
          />

          {/* 31-60 Days */}
          <SummaryBucket
            label="31-60 DAYS"
            amount={gt.days31to60}
            total={totalForPct}
            barColor={BUCKET_BAR_COLORS['31-60']}
            valueColor="text-amber-600"
          />

          {/* 61-90 Days */}
          <SummaryBucket
            label="61-90 DAYS"
            amount={gt.days61to90}
            total={totalForPct}
            barColor={BUCKET_BAR_COLORS['61-90']}
            valueColor="text-orange-600"
          />

          {/* Over 90 Days */}
          <Card className={cn(gt.over90 > 0 && 'border-red-200 bg-red-50')}>
            <CardContent>
              <p
                className={cn(
                  'text-xs font-medium',
                  gt.over90 > 0 ? 'text-red-500' : 'text-muted-foreground',
                )}
              >
                OVER 90 DAYS
              </p>
              <p
                className={cn(
                  'mt-1 text-2xl font-bold tabular-nums',
                  gt.over90 > 0 ? 'text-red-600' : 'text-foreground',
                )}
              >
                {formatGhs(gt.over90)}
              </p>
              <div className="mt-2 h-1 w-full rounded-full bg-gray-200">
                <div
                  className="h-1 rounded-full bg-red-500"
                  style={{ width: `${Math.min(100, (gt.over90 / totalForPct) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {((gt.over90 / totalForPct) * 100).toFixed(0)}% of total
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Supplier Breakdown Table */}
        {report.suppliers.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={<CheckCircle className="h-10 w-10" />}
                title="No outstanding payables"
                subtitle="All supplier balances are settled."
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>Supplier Breakdown</CardTitle>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Current
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    Critical
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase tracking-wide">
                      Supplier Name
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide">
                      Total Balance
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide">
                      1-30 Days
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide">
                      31-60 Days
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide">
                      61-90 Days
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide">
                      Over 90 Days
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.suppliers.map((s) => (
                    <SupplierRow key={s.supplierId} row={s} onRecordPayment={setPaymentTarget} />
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="text-sm font-semibold text-foreground">
                      Total Summary
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold text-foreground">
                      {formatGhs(gt.total)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-foreground">
                      {formatGhs(gt.current)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-amber-600">
                      {formatGhs(gt.days31to60)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-orange-600">
                      {formatGhs(gt.days61to90)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold text-red-600">
                      {formatGhs(gt.over90)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Bottom Row */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Cash Flow Advisory */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Cash Flow Advisory</CardTitle>
            </CardHeader>
            <CardContent>
              {criticalSupplier && criticalSupplier.totals.over90 > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Your &ldquo;Over 90 Days&rdquo; payables have{' '}
                    {((criticalSupplier.totals.over90 / totalForPct) * 100).toFixed(0)}%
                    concentration with{' '}
                    <span className="font-semibold text-foreground">
                      {criticalSupplier.supplierName}
                    </span>
                    . We recommend prioritising settlement to maintain your service level agreement
                    and avoid late penalties.
                  </p>
                  <div className="mt-4 flex gap-3">
                    <Button onClick={() => setPaymentTarget(criticalSupplier)}>
                      Review Payment Plan
                    </Button>
                    <Button variant="ghost">Dismiss Advisory</Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {gt.total === 0
                    ? 'All supplier payables are settled. Great work!'
                    : 'All outstanding payables are within acceptable aging limits. No urgent action required.'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Milestones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Upcoming Milestones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                  <div>
                    <p className="font-medium text-foreground">VAT Filing Deadline</p>
                    <p className="text-xs text-muted-foreground">Check GRA calendar</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                  <div>
                    <p className="font-medium text-foreground">Tax Compliance Cert</p>
                    <p className="text-xs text-muted-foreground">Renew before expiry</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Report generated as at {asAt}
        </p>
      </div>
    </div>
  )
}

// --- SummaryBucket ---

function SummaryBucket({
  label,
  amount,
  total,
  barColor,
  valueColor,
}: {
  label: string
  amount: number
  total: number
  barColor: string
  valueColor: string
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-xl font-bold tabular-nums', valueColor)}>{formatGhs(amount)}</p>
        <div className="mt-2 h-1 w-full rounded-full bg-gray-100">
          <div
            className={cn('h-1 rounded-full', barColor)}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{pct.toFixed(0)}% of total</p>
      </CardContent>
    </Card>
  )
}
