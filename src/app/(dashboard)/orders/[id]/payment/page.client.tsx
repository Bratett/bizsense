'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { recordPaymentReceived } from '@/actions/payments'
import type { OrderDetail } from '@/actions/orders'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { formatGhs } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/ui/page-header'

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash', icon: '\u{1F4B5}', requiresRef: false },
  { value: 'momo_mtn', label: 'MTN MoMo', icon: '\u{1F4F1}', requiresRef: true },
  { value: 'momo_telecel', label: 'Telecel', icon: '\u{1F4F1}', requiresRef: true },
  { value: 'momo_airtel', label: 'AirtelTigo', icon: '\u{1F4F1}', requiresRef: true },
  { value: 'bank', label: 'Bank', icon: '\u{1F3E6}', requiresRef: true },
] as const

type PaymentMethod = (typeof PAYMENT_OPTIONS)[number]['value']

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaymentFormClient({ order }: { order: OrderDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState(false)

  const totalAmount = Number(order.totalAmount ?? 0)
  const alreadyPaid = Number(order.amountPaid)
  const remaining = Math.max(0, Math.round((totalAmount - alreadyPaid) * 100) / 100)

  const [amount, setAmount] = useState(remaining.toFixed(2))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [momoReference, setMomoReference] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayISO())
  const [notes, setNotes] = useState('')

  const amountNum = Math.max(0, parseFloat(amount) || 0)
  const hasRef = paymentMethod.startsWith('momo_')
    ? momoReference.trim().length > 0
    : paymentMethod === 'bank'
      ? bankReference.trim().length > 0
      : true

  const canSubmit = amountNum > 0 && amountNum <= remaining + 0.001 && hasRef && !isPending

  const handleSubmit = () => {
    setError(null)
    setFieldErrors({})

    startTransition(async () => {
      try {
        const result = await recordPaymentReceived({
          orderId: order.id,
          amount: amountNum,
          paymentMethod,
          paymentDate,
          momoReference: momoReference.trim() || undefined,
          bankReference: bankReference.trim() || undefined,
          notes: notes.trim() || undefined,
        })

        if (result.success) {
          setSuccess(true)
          setTimeout(() => router.push(`/orders/${order.id}`), 1200)
        } else {
          setError(result.error)
          if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    })
  }

  return (
    <>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/orders" />}>Sales</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/orders/${order.id}`} />}>
              {order.orderNumber}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Record Payment</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="Record Payment"
        subtitle={order.orderNumber}
        backHref={`/orders/${order.id}`}
      />

      {/* Success banner */}
      {success && (
        <Alert className="mb-4 border-green-200 bg-green-50">
          <AlertDescription className="text-green-800">
            Payment recorded. Redirecting...
          </AlertDescription>
        </Alert>
      )}

      {/* Error banner */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Invoice summary */}
      <Card>
        <CardContent>
          <p className="text-xs font-medium text-muted-foreground">Invoice Summary</p>
          {order.customer && (
            <p className="mt-1 font-medium text-foreground">{order.customer.name}</p>
          )}
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Invoice total</span>
              <span>{formatGhs(totalAmount)}</span>
            </div>
            {alreadyPaid > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Previously paid</span>
                <span>{formatGhs(alreadyPaid)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between pt-1">
              <span className="font-medium text-amber-700">Outstanding</span>
              <span className="text-lg font-bold text-amber-700">{formatGhs(remaining)}</span>
            </div>
          </div>

          {/* FX info */}
          {order.fxRate && Number(order.fxRate) > 1 && (
            <Alert className="mt-2 border-yellow-200 bg-yellow-50">
              <AlertDescription className="text-xs text-yellow-700">
                Original rate: 1 USD = GHS {Number(order.fxRate).toFixed(4)} &middot; Invoice: GHS{' '}
                {formatGhs(totalAmount)} (USD {(totalAmount / Number(order.fxRate)).toFixed(2)})
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 space-y-4">
        {/* Amount field */}
        <div>
          <div className="flex items-center justify-between">
            <Label>
              GHS received <span className="text-destructive">*</span>
            </Label>
            <Button
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => setAmount(remaining.toFixed(2))}
            >
              Pay in full ({formatGhs(remaining)})
            </Button>
          </div>
          <Input
            type="text"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            max={remaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1"
          />
          {amountNum > 0 && amountNum < remaining - 0.001 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatGhs(remaining - amountNum)} still outstanding after this payment
            </p>
          )}
        </div>

        {/* Payment method */}
        <div>
          <Label className="mb-2 block">Payment Method</Label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPaymentMethod(opt.value)}
                className={`rounded-xl border p-3 text-center transition-colors ${
                  paymentMethod === opt.value
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border bg-background hover:border-muted-foreground/30'
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <p className="mt-1 text-sm font-medium text-foreground">{opt.label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* MoMo reference */}
        {paymentMethod.startsWith('momo_') && (
          <div>
            <Label>
              MoMo Reference <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              value={momoReference}
              onChange={(e) => setMomoReference(e.target.value)}
              placeholder="Transaction reference"
              className={`mt-1 ${fieldErrors.momoReference ? 'border-destructive' : ''}`}
            />
            {fieldErrors.momoReference && (
              <p className="mt-1 text-xs text-destructive">{fieldErrors.momoReference}</p>
            )}
          </div>
        )}

        {/* Bank reference */}
        {paymentMethod === 'bank' && (
          <div>
            <Label>
              Bank Reference <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
              placeholder="Transfer reference"
              className={`mt-1 ${fieldErrors.bankReference ? 'border-destructive' : ''}`}
            />
            {fieldErrors.bankReference && (
              <p className="mt-1 text-xs text-destructive">{fieldErrors.bankReference}</p>
            )}
          </div>
        )}

        {/* Date */}
        <div>
          <Label>Payment Date</Label>
          <Input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="mt-1"
          />
        </div>

        {/* Notes */}
        <div>
          <Label>Notes (optional)</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1"
            placeholder="Payment notes"
          />
        </div>

        <Button className="w-full py-3" onClick={handleSubmit} disabled={!canSubmit}>
          {isPending ? 'Recording...' : 'Record Payment'}
        </Button>
      </div>
    </>
  )
}
