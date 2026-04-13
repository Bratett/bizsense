'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Ban, CheckCircle, Clock, Mail, Phone } from 'lucide-react'
import type { OrderDetail } from '@/actions/orders'
import { reverseOrder } from '@/actions/orders'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import type { PaymentListItem } from '@/actions/payments'
import InvoiceButton from '@/components/InvoiceButton.client'
import { WhatsAppButton } from '@/components/ui/whatsapp-button'

import { formatGhs, formatDate, avatarColor, initials } from '@/lib/format'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTimestamp(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN Mobile Money',
  momo_telecel: 'Telecel Cash',
  momo_airtel: 'AirtelTigo Money',
  bank: 'Bank Transfer',
}

const PAYMENT_METHOD_ICONS: Record<string, string> = {
  cash: '\u{1F4B5}',
  momo_mtn: '\u{1F4F1}',
  momo_telecel: '\u{1F4F1}',
  momo_airtel: '\u{1F4F1}',
  bank: '\u{1F3E6}',
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SaleDetail({
  order,
  payments,
}: {
  order: OrderDetail
  payments: PaymentListItem[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showVoidModal, setShowVoidModal] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [restockInventory, setRestockInventory] = useState(true)
  const [voidError, setVoidError] = useState<string | null>(null)

  const remaining = Math.max(0, Number(order.totalAmount ?? 0) - Number(order.amountPaid))
  const isPaid = order.paymentStatus === 'paid'
  const isCancelled = order.status === 'cancelled'
  const discountAmount = Number(order.discountAmount ?? 0)

  const handleVoidSale = () => {
    if (!voidReason.trim()) {
      setVoidError('Please provide a reason')
      return
    }
    startTransition(async () => {
      const result = await reverseOrder({
        orderId: order.id,
        reason: voidReason,
        restockInventory,
      })
      if (result.success) {
        router.push('/sales')
      } else {
        setVoidError(result.error)
      }
    })
  }

  // Build activity timeline from order + payments
  const timeline: Array<{ label: string; date: Date; icon: string }> = []
  timeline.push({
    label: 'Order created',
    date: order.createdAt,
    icon: 'create',
  })
  for (const p of payments) {
    timeline.push({
      label: `Payment received via ${PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}`,
      date: p.createdAt,
      icon: 'payment',
    })
  }
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl p-4 md:p-8">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/sales" />}>Sales</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{order.orderNumber}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          backHref="/sales"
          title={`Sale #${order.orderNumber}`}
          subtitle={`Issued on ${formatDate(order.orderDate)}`}
          actions={
            <StatusBadge
              variant={isCancelled ? 'cancelled' : isPaid ? 'paid' : 'pending'}
            >
              {isCancelled ? 'VOIDED' : isPaid ? 'PAID' : 'PENDING'}
            </StatusBadge>
          }
        />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column -- 2/3 */}
          <div className="space-y-6 lg:col-span-2">
            {/* Customer Details */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Customer Details
                  </CardTitle>
                  {order.customer && (
                    <Link
                      href="/customers"
                      className="text-sm font-medium text-muted-foreground hover:text-primary"
                    >
                      Edit
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {order.customer ? (
                  <div className="flex items-start gap-4">
                    <Avatar size="lg">
                      <AvatarFallback className={`${avatarColor(order.customer.name)} text-white`}>
                        {initials(order.customer.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-lg font-semibold text-foreground">{order.customer.name}</p>
                      {order.customer.phone && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          {order.customer.phone}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Walk-in customer</p>
                )}
              </CardContent>
            </Card>

            {/* Products & Services */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Products & Services
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product / SKU</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">
                          {line.description ?? 'Item'}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {Number(line.quantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatGhs(line.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatGhs(line.lineTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Payment History & Activity Timeline */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Payment History */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments recorded</p>
                  ) : (
                    <div className="space-y-3">
                      {payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-lg">
                              {PAYMENT_METHOD_ICONS[p.paymentMethod] ?? '\u{1F4B0}'}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatShortDate(p.paymentDate)}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm font-semibold tabular-nums text-green-700">
                            {formatGhs(p.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Activity Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Activity Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative space-y-4">
                    {timeline.map((event, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="relative flex flex-col items-center">
                          <div
                            className={`h-3 w-3 rounded-full ${
                              event.icon === 'create' ? 'bg-gray-400' : 'bg-green-500'
                            }`}
                          />
                          {idx < timeline.length - 1 && <div className="mt-1 h-8 w-px bg-border" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{event.label}</p>
                          <p className="text-xs text-muted-foreground">{formatTimestamp(event.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right column -- 1/3 */}
          <div className="space-y-4">
            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium tabular-nums">
                      {formatGhs(order.subtotal)}
                    </span>
                  </div>
                  {Number(order.taxAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax (VAT 15%)</span>
                      <span className="font-medium tabular-nums">
                        {formatGhs(order.taxAmount)}
                      </span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-destructive">Discount (GHS)</span>
                      <span className="font-medium tabular-nums text-destructive">
                        -{formatGhs(discountAmount)}
                      </span>
                    </div>
                  )}
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Grand Total</span>
                    <span className="text-2xl font-bold tabular-nums text-primary">
                      {formatGhs(order.totalAmount)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Status */}
            <Card
              className={
                isCancelled
                  ? 'bg-muted'
                  : isPaid
                    ? 'bg-green-50 ring-green-200'
                    : 'bg-amber-50 ring-amber-200'
              }
            >
              <CardContent>
                <div className="flex items-center gap-3">
                  {isCancelled ? (
                    <>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                        <Ban className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground">VOIDED</p>
                        <p className="text-xs text-muted-foreground">This sale has been reversed</p>
                      </div>
                    </>
                  ) : isPaid ? (
                    <>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-200">
                        <CheckCircle className="h-5 w-5 text-green-700" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-green-700">FULLY PAID</p>
                        <p className="text-xs text-green-600">
                          Cleared on {formatShortDate(order.orderDate)}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200">
                        <Clock className="h-5 w-5 text-amber-700" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-700">OUTSTANDING</p>
                        <p className="text-xs tabular-nums text-amber-600">
                          {formatGhs(remaining)} remaining
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            {!isCancelled && (
              <div className="space-y-2">
                <InvoiceButton
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  totalAmount={order.totalAmount}
                  customerPhone={order.customer?.phone}
                />
                {order.customer?.phone && (
                  <WhatsAppButton
                    phone={order.customer.phone}
                    message={`Hi ${order.customer.name}, here is your invoice ${order.orderNumber} for ${formatGhs(order.totalAmount)}. Thank you for your business!`}
                    label="Share via WhatsApp"
                    className="w-full"
                  />
                )}
                <Button variant="outline" size="lg" className="w-full">
                  <Mail className="h-4 w-4" />
                  Send Invoice Email
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => setShowVoidModal(true)}
                >
                  <Ban className="h-4 w-4" />
                  Void Sale
                </Button>
              </div>
            )}

            {/* Growth Insight */}
            {order.customer && !isCancelled && (
              <Card className="bg-gradient-to-br from-amber-50 to-white">
                <CardContent>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-amber-500">&#10024;</span>
                    <h3 className="text-sm font-semibold">Growth Insight</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Track this customer&apos;s purchase patterns over time to identify upsell
                    opportunities and build long-term business relationships.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Void Sale Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg">Void Sale</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This will reverse all journal entries and mark the sale as cancelled. This action
                cannot be undone.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="void-reason">Reason for voiding</Label>
                  <textarea
                    id="void-reason"
                    value={voidReason}
                    onChange={(e) => {
                      setVoidReason(e.target.value)
                      setVoidError(null)
                    }}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    placeholder="e.g., Customer requested cancellation"
                  />
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={restockInventory}
                    onChange={(e) => setRestockInventory(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-600"
                  />
                  <span className="text-sm text-foreground">Restock inventory</span>
                </label>
                {voidError && (
                  <Alert variant="destructive">
                    <AlertDescription>{voidError}</AlertDescription>
                  </Alert>
                )}
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowVoidModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleVoidSale}
                  disabled={isPending}
                >
                  {isPending ? 'Voiding...' : 'Void Sale'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}
