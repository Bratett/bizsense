'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { reverseGrn, type GrnWithLinesAndJournal } from '@/actions/grn'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { formatGhs, formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/status-badge'
import { PageHeader } from '@/components/ui/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const STATUS_VARIANT: Record<string, 'draft' | 'approved'> = {
  draft: 'draft',
  confirmed: 'approved',
}

// ─── Reversal modal ───────────────────────────────────────────────────────────

function ReversalModal({
  grn,
  onClose,
  onSuccess,
}: {
  grn: GrnWithLinesAndJournal
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [quantities, setQuantities] = useState<number[]>(grn.lines.map(() => 0))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasAnyReturn = quantities.some((q) => q > 0)
  const totalReturning = quantities.reduce((s, q) => s + q, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Reason is required.')
      return
    }
    if (!hasAnyReturn) {
      setError('Enter a return quantity for at least one line.')
      return
    }
    setSubmitting(true)
    setError(null)

    const result = await reverseGrn({
      grnId: grn.id,
      reason: reason.trim(),
      lines: grn.lines
        .map((l, i) => ({ grnLineId: l.id, quantityReturning: quantities[i] }))
        .filter((l) => l.quantityReturning > 0),
    })

    if (result.success) {
      onSuccess()
    } else {
      setError(result.error)
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Reverse GRN -- Purchase Return</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter quantities to return. A reversal journal entry will be posted.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            {grn.lines.map((line, i) => (
              <div key={line.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {line.productName}
                  <span className="ml-1 text-xs text-muted-foreground">
                    (max {Number(line.quantityReceived).toFixed(2)})
                  </span>
                </span>
                <Input
                  type="text"
                  min={0}
                  max={Number(line.quantityReceived)}
                  step="0.01"
                  value={quantities[i] || ''}
                  onChange={(e) => {
                    const val = Math.min(
                      Math.max(0, Number(e.target.value)),
                      Number(line.quantityReceived),
                    )
                    setQuantities((prev) => prev.map((q, idx) => (idx === i ? val : q)))
                  }}
                  className="w-24 text-right"
                />
              </div>
            ))}
          </div>

          <div>
            <Label>
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Damaged goods, wrong item delivered"
              className="mt-1"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" type="submit" disabled={submitting || !hasAnyReturn}>
              {submitting
                ? 'Posting reversal...'
                : `Return${totalReturning > 0 ? ` ${totalReturning.toFixed(2)} units` : ''}`}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GrnDetail({ grn, role }: { grn: GrnWithLinesAndJournal; role: string }) {
  const router = useRouter()
  const [showReversal, setShowReversal] = useState(false)
  const [journalExpanded, setJournalExpanded] = useState(false)

  const canReverse = grn.status === 'confirmed' && (role === 'owner' || role === 'manager')
  const canSeeJournal = role === 'owner' || role === 'accountant' || role === 'manager'
  const isCashPayment = grn.journalSummary?.description?.includes('Cash payment') ?? false

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/grn" />}>GRN</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{grn.grnNumber}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={grn.grnNumber}
        backHref="/grn"
        actions={
          <StatusBadge variant={STATUS_VARIANT[grn.status] ?? 'draft'}>
            {grn.status === 'confirmed' ? 'Confirmed' : 'Draft'}
          </StatusBadge>
        }
      />

      <div className="space-y-4">
        {/* Supplier + date info */}
        <Card>
          <CardContent className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{grn.supplierName}</p>
              {grn.poNumber && (
                <Link
                  href={`/purchase-orders/${grn.poId}`}
                  className="mt-0.5 block text-xs text-primary hover:underline"
                >
                  PO: {grn.poNumber}
                </Link>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Received</p>
              <p className="text-sm font-medium text-foreground">{formatDate(grn.receivedDate)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Lines table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Product</TableHead>
                <TableHead className="px-4 text-right">Qty</TableHead>
                <TableHead className="px-4 text-right">Unit Cost</TableHead>
                <TableHead className="px-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grn.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="px-4 text-foreground">{line.productName}</TableCell>
                  <TableCell className="px-4 text-right">
                    {Number(line.quantityReceived).toFixed(2)}
                  </TableCell>
                  <TableCell className="px-4 text-right">{formatGhs(line.unitCost)}</TableCell>
                  <TableCell className="px-4 text-right font-medium text-foreground">
                    {formatGhs(line.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="px-4 text-right font-semibold">
                  Total
                </TableCell>
                <TableCell className="px-4 text-right font-bold text-foreground">
                  {formatGhs(grn.totalCost)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Card>

        {/* Payment type */}
        {grn.status === 'confirmed' && (
          <Card>
            <CardContent>
              <p className="text-sm text-foreground">
                <span className="font-medium">Payment: </span>
                {isCashPayment
                  ? `Cash payment -- ${formatGhs(grn.totalCost)}`
                  : `Credit -- payable to ${grn.supplierName}`}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {grn.notes && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </p>
              <p className="mt-1 text-sm text-foreground">{grn.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Journal entry summary (owner/manager/accountant) */}
        {canSeeJournal && grn.journalEntryId && grn.journalSummary && (
          <Card>
            <button
              onClick={() => setJournalExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-medium text-foreground">Journal Entry</span>
              <span className="text-xs text-muted-foreground">
                {journalExpanded ? '\u25B2' : '\u25BC'}
              </span>
            </button>
            {journalExpanded && (
              <CardContent className="border-t border-border text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium">Date:</span>{' '}
                  {formatDate(grn.journalSummary.entryDate)}
                </p>
                <p>
                  <span className="font-medium">Reference:</span> {grn.journalSummary.reference}
                </p>
                <p>
                  <span className="font-medium">Description:</span> {grn.journalSummary.description}
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {/* Reverse action */}
        {canReverse && (
          <div className="flex justify-end">
            <Button variant="destructive" onClick={() => setShowReversal(true)}>
              Reverse GRN (Purchase Return)
            </Button>
          </div>
        )}
      </div>

      {showReversal && (
        <ReversalModal
          grn={grn}
          onClose={() => setShowReversal(false)}
          onSuccess={() => {
            setShowReversal(false)
            router.push('/grn')
          }}
        />
      )}
    </div>
  )
}
