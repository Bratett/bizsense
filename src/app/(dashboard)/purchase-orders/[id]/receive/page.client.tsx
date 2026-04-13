'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createGrn, confirmGrn } from '@/actions/grn'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { generateGrnNumber } from '@/lib/grnNumber'
import type { PoWithLinesAndGrns } from '@/actions/purchaseOrders'
import { formatGhs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

// ─── Types ───────────────────────────────────────────────────────────────────

type ReceivingLine = {
  poLineId: string
  productId: string | null
  productDescription: string | null
  quantityOrdered: number
  quantityPreviouslyReceived: number
  quantityOutstanding: number
  quantityReceiving: string // editable
  unitCost: string // editable, pre-filled from PO
}

type PaymentType = 'credit' | 'cash'
type PaymentMethod = 'cash' | 'momo_mtn' | 'momo_telecel' | 'momo_airtel' | 'bank'

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  momo_mtn: 'MoMo MTN',
  momo_telecel: 'MoMo Telecel',
  momo_airtel: 'MoMo AirtelTigo',
  bank: 'Bank Transfer',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReceiveGoodsForm({ po }: { po: PoWithLinesAndGrns }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Pre-populate lines from PO outstanding quantities
  const [lines, setLines] = useState<ReceivingLine[]>(() =>
    po.lines
      .filter((l) => Number(l.quantityOutstanding) > 0.001)
      .map((l) => ({
        poLineId: l.id,
        productId: l.productId,
        productDescription: l.description,
        quantityOrdered: Number(l.quantity),
        quantityPreviouslyReceived: Number(l.quantityReceived),
        quantityOutstanding: Number(l.quantityOutstanding),
        quantityReceiving: Number(l.quantityOutstanding).toFixed(2), // default to full outstanding
        unitCost: l.unitCost, // pre-filled from PO
      })),
  )

  const [receivedDate, setReceivedDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('credit')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [confirmMode, setConfirmMode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalCost = lines.reduce(
    (s, l) => s + parseNum(l.quantityReceiving) * parseNum(l.unitCost),
    0,
  )

  function updateLine(poLineId: string, field: 'quantityReceiving' | 'unitCost', value: string) {
    setLines((prev) => prev.map((l) => (l.poLineId === poLineId ? { ...l, [field]: value } : l)))
  }

  const hasAnyReceiving = lines.some((l) => parseNum(l.quantityReceiving) > 0)
  const canSubmit =
    hasAnyReceiving &&
    !!receivedDate &&
    lines
      .filter((l) => parseNum(l.quantityReceiving) > 0)
      .every((l) => parseNum(l.unitCost) >= 0 && l.productId)

  async function handleSubmit(shouldConfirm: boolean) {
    setError(null)

    const grnNumber = await generateGrnNumber()
    const activeLines = lines.filter((l) => parseNum(l.quantityReceiving) > 0)

    startTransition(async () => {
      const createResult = await createGrn({
        supplierId: po.supplierId,
        poId: po.id,
        receivedDate,
        notes: notes.trim() || undefined,
        grnNumber,
        lines: activeLines.map((l) => ({
          productId: l.productId!,
          poLineId: l.poLineId,
          quantityOrdered: l.quantityOrdered,
          quantityReceived: parseNum(l.quantityReceiving),
          unitCost: parseNum(l.unitCost),
        })),
      })

      if (!createResult.success) {
        setError(createResult.error)
        setConfirmMode(false)
        return
      }

      if (shouldConfirm) {
        const confirmResult = await confirmGrn({
          grnId: createResult.grnId,
          paymentMethod: paymentType === 'cash' ? paymentMethod : undefined,
        })

        if (!confirmResult.success) {
          setError(confirmResult.error)
          router.push(`/grn/${createResult.grnId}`)
          return
        }
      }

      router.push(`/grn/${createResult.grnId}`)
    })
  }

  if (po.lines.every((l) => Number(l.quantityOutstanding) <= 0.001)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={po.poNumber} backHref={`/purchase-orders/${po.id}`} />
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-lg font-medium text-foreground">All lines fully received</p>
            <p className="mt-1 text-sm text-muted-foreground">
              There are no outstanding quantities on this purchase order.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/purchase-orders" />}>Purchase Orders</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/purchase-orders/${po.id}`} />}>{po.poNumber}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Receive</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={`Receive Goods -- ${po.poNumber}`}
        subtitle={po.supplierName}
        backHref={`/purchase-orders/${po.id}`}
      />

      <div className="space-y-4">
        {/* Date */}
        <Card>
          <CardContent>
            <Label>Date Received</Label>
            <Input
              type="date"
              value={receivedDate}
              max={todayISO()}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="mt-1 w-auto"
            />
          </CardContent>
        </Card>

        {/* Line items table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Product</TableHead>
                <TableHead className="px-3 text-right">Ordered</TableHead>
                <TableHead className="px-3 text-right">Received</TableHead>
                <TableHead className="px-3 text-right">Outstanding</TableHead>
                <TableHead className="px-3 text-right">Receiving Now</TableHead>
                <TableHead className="px-3 text-right">Unit Cost</TableHead>
                <TableHead className="px-3 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const lineTotal = parseNum(line.quantityReceiving) * parseNum(line.unitCost)
                const receivingNum = parseNum(line.quantityReceiving)
                const exceedsOutstanding = receivingNum > line.quantityOutstanding + 0.001

                return (
                  <TableRow key={line.poLineId}>
                    <TableCell className="px-4 text-foreground">
                      {line.productDescription ?? '--'}
                    </TableCell>
                    <TableCell className="px-3 text-right text-muted-foreground">
                      {line.quantityOrdered.toFixed(2)}
                    </TableCell>
                    <TableCell className="px-3 text-right text-muted-foreground">
                      {line.quantityPreviouslyReceived.toFixed(2)}
                    </TableCell>
                    <TableCell className="px-3 text-right text-muted-foreground">
                      {line.quantityOutstanding.toFixed(2)}
                    </TableCell>
                    <TableCell className="px-3 text-right">
                      <Input
                        type="number"
                        min="0"
                        max={line.quantityOutstanding}
                        step="0.01"
                        value={line.quantityReceiving}
                        onChange={(e) =>
                          updateLine(line.poLineId, 'quantityReceiving', e.target.value)
                        }
                        className={`w-20 text-right ${
                          exceedsOutstanding ? 'border-destructive bg-destructive/5' : ''
                        }`}
                      />
                      {exceedsOutstanding && (
                        <p className="mt-0.5 text-xs text-destructive">Exceeds outstanding</p>
                      )}
                    </TableCell>
                    <TableCell className="px-3 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(e) => updateLine(line.poLineId, 'unitCost', e.target.value)}
                        className="w-24 text-right"
                      />
                    </TableCell>
                    <TableCell className="px-3 text-right font-medium text-foreground">
                      {formatGhs(lineTotal)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6} className="px-4 text-right font-semibold">
                  Total
                </TableCell>
                <TableCell className="px-3 text-right font-bold text-foreground">
                  {formatGhs(totalCost)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Card>

        {/* Payment type */}
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button
                variant={paymentType === 'credit' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setPaymentType('credit')}
              >
                On Credit -- create payable
              </Button>
              <Button
                variant={paymentType === 'cash' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setPaymentType('cash')}
              >
                Paid now
              </Button>
            </div>
            {paymentType === 'cash' && (
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="mt-3 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent>
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Confirm dialog */}
        {confirmMode && (
          <Alert>
            <AlertDescription>
              <p className="font-medium">Confirm Receipt</p>
              <p className="mt-1 text-sm">
                Confirming will add{' '}
                {lines
                  .filter((l) => parseNum(l.quantityReceiving) > 0)
                  .reduce((s, l) => s + parseNum(l.quantityReceiving), 0)
                  .toFixed(2)}{' '}
                units to inventory and{' '}
                {paymentType === 'credit'
                  ? `create a payable of ${formatGhs(totalCost)} to ${po.supplierName}`
                  : `record a payment of ${formatGhs(totalCost)}`}
                .
              </p>
              <div className="mt-3 flex gap-3">
                <Button variant="outline" onClick={() => setConfirmMode(false)}>
                  Cancel
                </Button>
                <Button disabled={isPending} onClick={() => handleSubmit(true)}>
                  {isPending ? 'Confirming...' : 'Yes, Confirm Receipt'}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        {!confirmMode && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 py-3"
              disabled={!canSubmit || isPending}
              onClick={() => handleSubmit(false)}
            >
              {isPending ? 'Saving...' : 'Save as Draft'}
            </Button>
            <Button
              className="flex-1 py-3"
              disabled={!canSubmit || isPending}
              onClick={() => setConfirmMode(true)}
            >
              Confirm Receipt
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
