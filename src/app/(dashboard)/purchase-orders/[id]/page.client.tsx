'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { markPoSent, cancelPurchaseOrder } from '@/actions/purchaseOrders'
import type { PoWithLinesAndGrns } from '@/actions/purchaseOrders'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { WhatsAppButton } from '@/components/ui/whatsapp-button'
import { purchaseOrderTemplate } from '@/lib/whatsapp/templates'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { formatGhs, formatDate } from '@/lib/format'

// ─── Status mapping ──────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'> = {
  draft: 'draft',
  sent: 'sent',
  partially_received: 'partial',
  received: 'received',
  cancelled: 'cancelled',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_received: 'Partially Received',
  received: 'Received',
  cancelled: 'Cancelled',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PurchaseOrderDetail({
  po,
  businessName,
}: {
  po: PoWithLinesAndGrns
  businessName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  function showError(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const poWhatsAppMessage = purchaseOrderTemplate({
    supplierName: po.supplierName,
    businessName,
    poNumber: po.poNumber,
    lines: po.lines.map((l) => ({
      description: l.description ?? '',
      quantity: Number(l.quantity),
      unitCost: Number(l.unitCost),
    })),
    totalAmount: Number(po.totalAmount),
    expectedDate: po.expectedDate ?? undefined,
  })

  function handleSend() {
    startTransition(async () => {
      const result = await markPoSent(po.id)
      if (!result.success) {
        showError(result.error)
        return
      }

      router.refresh()
    })
  }

  function handleCancel() {
    if (!confirm('Cancel this purchase order?')) return
    startTransition(async () => {
      try {
        await cancelPurchaseOrder(po.id)
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Could not cancel PO.')
      }
    })
  }

  const canEdit = po.status === 'draft'
  const canSend = po.status === 'draft'
  const canReceive = po.status === 'sent' || po.status === 'partially_received'
  const canCancel = po.status === 'draft' || po.status === 'sent'

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Toast */}
        {toast && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{toast}</AlertDescription>
          </Alert>
        )}

        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/purchase-orders" />}>
                Purchase Orders
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{po.poNumber}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <PageHeader
          title={po.poNumber}
          subtitle={`${po.supplierName} · ${formatDate(po.orderDate)}`}
          backHref="/purchase-orders"
          actions={
            <StatusBadge variant={STATUS_VARIANT[po.status] ?? 'draft'}>
              {STATUS_LABEL[po.status] ?? po.status}
            </StatusBadge>
          }
        />

        {po.expectedDate && (
          <p className="-mt-4 mb-4 text-xs text-muted-foreground">
            Expected: {formatDate(po.expectedDate)}
          </p>
        )}
        {po.currency === 'USD' && po.fxRate && (
          <p className="-mt-4 mb-4 text-xs text-muted-foreground">
            USD order at rate GHS {Number(po.fxRate).toFixed(4)}
          </p>
        )}

        {/* Line items table */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-sm">Line Items</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Description</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-foreground">{line.description ?? '—'}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {Number(line.quantity).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {Number(line.quantityReceived).toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      Number(line.quantityOutstanding) > 0 ? 'text-amber-600' : 'text-green-600'
                    }`}
                  >
                    {Number(line.quantityOutstanding).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatGhs(line.unitCost)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-foreground">
                    {formatGhs(line.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-right text-muted-foreground">
                  Subtotal
                </TableCell>
                <TableCell className="text-right font-medium text-foreground">
                  {formatGhs(po.subtotal)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={5} className="text-right font-semibold text-foreground">
                  Total
                </TableCell>
                <TableCell className="text-right font-bold text-foreground">
                  {formatGhs(po.totalAmount)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Card>

        {/* GRNs section */}
        {po.grns.length > 0 && (
          <Card className="mt-4">
            <CardHeader className="border-b">
              <CardTitle className="text-sm">Goods Received Notes</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {po.grns.map((grn) => (
                <div key={grn.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{grn.grnNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(grn.receivedDate)} &middot;{' '}
                      <span
                        className={
                          grn.status === 'confirmed' ? 'text-green-600' : 'text-muted-foreground'
                        }
                      >
                        {grn.status}
                      </span>
                    </p>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {formatGhs(grn.totalCost)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {po.notes && (
          <Card className="mt-4">
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{po.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {(canEdit || canSend || canReceive || canCancel) && (
          <div className="mt-6 space-y-3">
            {canReceive && (
              <Button
                render={<Link href={`/purchase-orders/${po.id}/grn/new`} />}
                className="w-full"
                size="lg"
              >
                {po.status === 'partially_received'
                  ? 'Receive Remaining Goods'
                  : 'Receive Goods (Create GRN)'}
              </Button>
            )}

            <div className="flex gap-3">
              {canEdit && (
                <Button
                  render={<Link href={`/purchase-orders/${po.id}/edit`} />}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  Edit PO
                </Button>
              )}
              {canSend && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={handleSend}
                  className="flex-1"
                  size="lg"
                >
                  Send to Supplier
                </Button>
              )}
              {canCancel && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending}
                  onClick={handleCancel}
                  className="flex-1"
                  size="lg"
                >
                  Cancel PO
                </Button>
              )}
            </div>

            {po.supplierPhone && (
              <WhatsAppButton
                phone={po.supplierPhone}
                message={poWhatsAppMessage}
                label="Share PO via WhatsApp"
                className="w-full"
              />
            )}
          </div>
        )}
      </div>
    </main>
  )
}
