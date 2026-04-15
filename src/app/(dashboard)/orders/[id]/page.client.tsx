'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { OrderDetail } from '@/actions/orders'
import type { PendingMomoLink } from '@/actions/hubtelLinks'
import { generatePaymentLink, getPaymentLinkStatus } from '@/actions/hubtelLinks'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import InvoiceButton from '@/components/InvoiceButton.client'
import { WhatsAppButton } from '@/components/whatsapp/WhatsAppButton'
import { invoiceTemplate, paymentLinkTemplate } from '@/lib/whatsapp/templates'
import { formatGhs, formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/ui/page-header'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel Cash',
  momo_airtel: 'AirtelTigo Money',
  bank: 'Bank Transfer',
}

function PaymentStatusBadge({
  paymentStatus,
  totalAmount,
  amountPaid,
}: {
  paymentStatus: string
  totalAmount: string | null
  amountPaid: string
}) {
  const outstanding = Math.max(0, Number(totalAmount ?? 0) - Number(amountPaid))
  if (paymentStatus === 'paid') {
    return <StatusBadge variant="paid">Paid</StatusBadge>
  }
  if (paymentStatus === 'unpaid') {
    return <StatusBadge variant="unpaid">Unpaid &middot; GHS {outstanding.toFixed(2)}</StatusBadge>
  }
  return (
    <StatusBadge variant="partial">Partial &middot; GHS {outstanding.toFixed(2)} due</StatusBadge>
  )
}

export default function OrderDetailView({
  order,
  businessName,
  businessPhone,
  momoLink: initialMomoLink,
}: {
  order: OrderDetail
  businessName: string
  businessPhone: string | null
  momoLink: PendingMomoLink | null
}) {
  const router = useRouter()
  const remaining = Math.max(0, Number(order.totalAmount ?? 0) - Number(order.amountPaid))
  const isUnpaidOrPartial = order.status === 'fulfilled' && order.paymentStatus !== 'paid'

  const [pendingLink, setPendingLink] = useState<PendingMomoLink | null>(initialMomoLink)
  const [isPending, startTransition] = useTransition()
  const [isCopied, setIsCopied] = useState(false)

  return (
    <div className="mx-auto max-w-lg">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/orders" />}>Sales</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{order.orderNumber}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={order.orderNumber}
        subtitle={formatDate(order.orderDate)}
        backHref="/orders"
        actions={
          <div className="flex flex-col items-end gap-1">
            <StatusBadge variant="draft">{order.status}</StatusBadge>
            <PaymentStatusBadge
              paymentStatus={order.paymentStatus}
              totalAmount={order.totalAmount}
              amountPaid={order.amountPaid}
            />
          </div>
        }
      />

      {/* Customer */}
      <Card>
        <CardContent>
          <p className="text-xs font-medium text-muted-foreground">Customer</p>
          {order.customer ? (
            <div className="mt-1">
              <p className="font-medium text-foreground">{order.customer.name}</p>
              {order.customer.phone && (
                <p className="text-sm text-muted-foreground">{order.customer.phone}</p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-muted-foreground">Walk-in</p>
          )}
        </CardContent>
      </Card>

      {/* Line items */}
      <Card className="mt-4">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Items ({order.lines.length})</p>
        </div>
        <div className="divide-y divide-border">
          {order.lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  {Number(line.quantity)} x {line.unitPriceCurrency === 'USD' ? 'USD' : 'GHS'}{' '}
                  {Number(line.unitPrice).toFixed(2)}
                </p>
              </div>
              <p className="ml-4 text-sm font-medium text-foreground">
                {formatGhs(line.lineTotal)}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Totals */}
      <Card className="mt-4">
        <CardContent className="space-y-1">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatGhs(order.subtotal)}</span>
          </div>
          {order.discountAmount && Number(order.discountAmount) > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                Discount
                {order.discountType === 'percentage' && order.discountValue
                  ? ` (${Number(order.discountValue)}%)`
                  : ''}
              </span>
              <span className="text-destructive">-{formatGhs(order.discountAmount)}</span>
            </div>
          )}
          {order.taxAmount && Number(order.taxAmount) > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tax</span>
              <span>{formatGhs(order.taxAmount)}</span>
            </div>
          )}
          {order.fxRate && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>FX Rate</span>
              <span>1 USD = GHS {Number(order.fxRate).toFixed(2)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between pt-1">
            <span className="text-lg font-bold text-foreground">TOTAL</span>
            <span className="text-lg font-bold text-foreground">
              {formatGhs(order.totalAmount)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Payment */}
      {order.payment && (
        <Card className="mt-4">
          <CardContent>
            <p className="text-xs font-medium text-muted-foreground">Payment</p>
            <div className="mt-1 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium text-foreground">
                  {PAYMENT_METHOD_LABELS[order.payment.paymentMethod] ??
                    order.payment.paymentMethod}
                </span>
              </div>
              {order.payment.momoReference && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">MoMo Ref</span>
                  <span className="font-mono text-foreground">{order.payment.momoReference}</span>
                </div>
              )}
              {order.payment.bankReference && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Bank Ref</span>
                  <span className="font-mono text-foreground">{order.payment.bankReference}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-medium text-green-700">{formatGhs(order.amountPaid)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outstanding balance + Record Payment */}
      {isUnpaidOrPartial && (
        <Card className="mt-4 border-amber-200 bg-amber-50">
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-700">Outstanding Balance</p>
                <p className="text-2xl font-bold text-amber-800">GHS {remaining.toFixed(2)}</p>
                {order.paymentStatus === 'partial' && (
                  <p className="text-xs text-amber-600">
                    GHS {Number(order.amountPaid).toFixed(2)} already paid
                  </p>
                )}
              </div>
              <Button onClick={() => router.push(`/orders/${order.id}/payment`)}>
                Record Payment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MoMo Payment Link — generate, share, or show status */}

      {/* State A: no link exists yet, and order still has an outstanding balance */}
      {isUnpaidOrPartial && !pendingLink && (
        <div className="mt-4">
          <Button
            variant="outline"
            className="w-full"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await generatePaymentLink(order.id)
                  setPendingLink({
                    id: result.linkId,
                    checkoutUrl: result.checkoutUrl,
                    amount: remaining.toFixed(2),
                    status: 'pending',
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    paidAt: null,
                    momoReference: null,
                  })
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to generate payment link')
                }
              })
            }
          >
            {isPending ? 'Generating...' : 'Generate MoMo Payment Link'}
          </Button>
        </div>
      )}

      {/* State B: pending link — let customer pay, owner can share / copy / check */}
      {pendingLink && pendingLink.status === 'pending' && (
        <Card className="mt-4 border-indigo-200 bg-indigo-50">
          <CardContent>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-indigo-700">MoMo Payment Link</p>
              <StatusBadge variant="partial">PENDING</StatusBadge>
            </div>
            <p className="text-lg font-bold text-indigo-900">GHS {remaining.toFixed(2)}</p>
            {pendingLink.expiresAt && (
              <p className="mt-0.5 text-xs text-indigo-600">
                Expires {new Date(pendingLink.expiresAt).toLocaleString('en-GH')}
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              {order.customer?.phone && (
                <WhatsAppButton
                  phone={order.customer.phone}
                  message={paymentLinkTemplate({
                    businessName,
                    customerName: order.customer.name,
                    orderNumber: order.orderNumber,
                    totalAmount: remaining,
                    paymentUrl: pendingLink.checkoutUrl ?? '',
                  })}
                  label="Send via WhatsApp"
                  variant="primary"
                  className="w-full"
                />
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(pendingLink.checkoutUrl ?? '')
                  setIsCopied(true)
                  setTimeout(() => setIsCopied(false), 2000)
                }}
              >
                {isCopied ? 'Copied!' : 'Copy Link'}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const status = await getPaymentLinkStatus(pendingLink.id)
                      setPendingLink((prev) => (prev ? { ...prev, ...status } : prev))
                    } catch {
                      // Status check failed — link state unchanged
                    }
                  })
                }
              >
                {isPending ? 'Checking...' : 'Check Status'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* State C: paid — confirmation banner */}
      {pendingLink && pendingLink.status === 'paid' && (
        <Card className="mt-4 border-green-200 bg-green-50">
          <CardContent>
            <p className="text-sm font-medium text-green-800">
              ✓ Paid via MoMo &mdash; GHS {Number(pendingLink.amount).toFixed(2)}
              {pendingLink.momoReference && (
                <span className="ml-1 font-mono text-green-700">
                  · Ref: {pendingLink.momoReference}
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Invoice Actions */}
      <InvoiceButton
        orderId={order.id}
        orderNumber={order.orderNumber}
        totalAmount={order.totalAmount}
        customerPhone={order.customer?.phone}
        customerName={order.customer?.name}
        businessName={businessName}
        businessPhone={businessPhone}
      />
      {order.customer?.phone && (
        <div className="mt-2">
          <WhatsAppButton
            phone={order.customer.phone}
            message={invoiceTemplate({
              businessName,
              customerName: order.customer.name,
              orderNumber: order.orderNumber,
              totalAmount: Number(order.totalAmount ?? 0),
              dueDate: order.orderDate,
              businessPhone: businessPhone ?? undefined,
            })}
            label="Share Invoice via WhatsApp"
            variant="secondary"
            className="w-full"
          />
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <Card className="mt-4">
          <CardContent>
            <p className="text-xs font-medium text-muted-foreground">Notes</p>
            <p className="mt-1 text-sm text-foreground">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
