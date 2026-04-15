'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  deactivateCustomer,
  type CustomerWithBalance,
  type CustomerStats,
  type CustomerTransaction,
} from '@/actions/customers'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { Separator } from '@/components/ui/separator'
import { formatGhs, avatarColor, initials } from '@/lib/format'
import { WhatsAppButton } from '@/components/whatsapp/WhatsAppButton'
import { paymentReminderTemplate } from '@/lib/whatsapp/templates'

// Compact currency — e.g. GHS 12.8k
function formatGhsCompact(amount: number): string {
  if (amount >= 1_000_000) return `GHS ${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `GHS ${(amount / 1_000).toFixed(1)}k`
  return formatGhs(amount)
}

export default function CustomerDetail({
  customer,
  stats,
  transactions,
  businessName,
  businessPhone,
}: {
  customer: CustomerWithBalance
  stats: CustomerStats
  transactions: CustomerTransaction[]
  businessName: string
  businessPhone: string | null
}) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDeactivate() {
    setDeactivateError(null)
    startTransition(async () => {
      const result = await deactivateCustomer(customer.id)
      if (result.success) {
        router.push('/customers')
      } else {
        setShowConfirm(false)
        setDeactivateError(result.error)
      }
    })
  }

  const creditLimit = Number(customer.creditLimit)
  const balance = customer.outstandingBalance
  const utilizationPct = creditLimit > 0 ? Math.min((balance / creditLimit) * 100, 100) : 0
  const utilizationColor =
    utilizationPct >= 80 ? 'bg-red-500' : utilizationPct >= 50 ? 'bg-amber-500' : 'bg-green-600'

  const color = avatarColor(customer.name)
  const inits = initials(customer.name)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/customers" />}>Customers</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{customer.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title={customer.name} backHref="/customers" />

      {deactivateError && (
        <Alert variant="destructive">
          <AlertDescription>{deactivateError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* ── Left: Contact + actions (2 cols) ── */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardContent className="flex flex-col p-5">
              {/* Avatar + name */}
              <div className="flex flex-col items-center text-center">
                <Avatar className="size-16">
                  <AvatarFallback className={`text-xl font-bold text-white ${color}`}>
                    {inits}
                  </AvatarFallback>
                </Avatar>
                <h2 className="mt-3 text-lg font-semibold text-foreground">{customer.name}</h2>
                {!customer.isActive && (
                  <Badge variant="secondary" className="mt-1">
                    Inactive
                  </Badge>
                )}
                {customer.location && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <svg
                      className="h-3.5 w-3.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                      />
                    </svg>
                    {customer.location}
                  </p>
                )}
              </div>

              <Separator className="my-4" />

              {/* Contact rows */}
              <div className="space-y-1">
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                        />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">PHONE</p>
                      <p className="text-sm font-medium text-green-700">{customer.phone}</p>
                    </div>
                  </a>
                )}
                {customer.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                        />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">EMAIL</p>
                      <p className="truncate text-sm font-medium text-foreground">
                        {customer.email}
                      </p>
                    </div>
                  </a>
                )}
                {customer.momoNumber && (
                  <div className="flex items-center gap-3 rounded-lg p-1.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3"
                        />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">MOMO</p>
                      <p className="text-sm font-medium text-foreground">{customer.momoNumber}</p>
                    </div>
                  </div>
                )}
                {customer.notes && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">NOTES</p>
                    <p className="text-sm text-foreground">{customer.notes}</p>
                  </div>
                )}
              </div>

              {/* Credit Utilization */}
              {creditLimit > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Credit Utilization
                    </p>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-base font-bold text-foreground">
                        {formatGhs(balance)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        of {formatGhs(creditLimit)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${utilizationColor}`}
                        style={{ width: `${utilizationPct}%` }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Primary actions */}
              <div className="mt-5 space-y-2">
                <Button
                  render={<Link href={`/orders/new?customerId=${customer.id}`} />}
                  className="h-11 w-full text-sm font-semibold"
                >
                  {/* receipt icon */}
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
                    />
                  </svg>
                  New Sale
                </Button>

                {balance > 0 && (
                  <Button
                    variant="outline"
                    render={<Link href={`/orders?customerId=${customer.id}&recordPayment=true`} />}
                    className="h-11 w-full border-green-200 text-sm font-semibold text-green-700 hover:bg-green-50"
                  >
                    {/* banknotes icon */}
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"
                      />
                    </svg>
                    Record Payment
                  </Button>
                )}

                {balance > 0 && customer.phone && (
                  <WhatsAppButton
                    phone={customer.phone}
                    message={paymentReminderTemplate({
                      businessName,
                      customerName: customer.name,
                      orderNumber: '(see statement)',
                      outstanding: balance,
                      dueDate: new Date().toISOString().slice(0, 10),
                      businessPhone: businessPhone ?? customer.phone,
                    })}
                    label="Send Reminder"
                    variant="secondary"
                    className="h-10 w-full"
                  />
                )}

                <Button
                  variant="outline"
                  render={<Link href={`/customers/${customer.id}/edit`} />}
                  className="h-10 w-full text-sm font-medium"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
                    />
                  </svg>
                  Edit
                </Button>

                {customer.isActive && (
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirm(true)}
                    className="h-10 w-full border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    Deactivate Customer
                  </Button>
                )}
              </div>

              {/* Financial Performance */}
              {stats.totalOrders > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Financial Performance
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs text-muted-foreground">Lifetime Value</p>
                        <p className="mt-0.5 text-base font-bold text-foreground">
                          {formatGhsCompact(stats.lifetimeValue)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs text-muted-foreground">Total Paid</p>
                        <p className="mt-0.5 text-base font-bold text-green-700">
                          {formatGhsCompact(stats.totalPaid)}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Stats + Transactions (3 cols) ── */}
        <div className="space-y-5 lg:col-span-3">
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Total Orders */}
            <Card className="border-l-4 border-l-green-600">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Orders
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {stats.totalOrders}
                </p>
                {stats.ordersThisMonth > 0 && (
                  <p className="mt-1 text-xs text-green-600">+{stats.ordersThisMonth} this month</p>
                )}
              </CardContent>
            </Card>

            {/* Total Paid */}
            <Card className="border-l-4 border-l-amber-400">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Paid
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {formatGhsCompact(stats.totalPaid)}
                </p>
              </CardContent>
            </Card>

            {/* Outstanding */}
            <Card
              className={
                balance > 0 ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-green-600'
              }
            >
              <CardContent className="p-4">
                <p
                  className={`text-xs font-semibold uppercase tracking-wider ${balance > 0 ? 'text-red-500' : 'text-muted-foreground'}`}
                >
                  Outstanding
                </p>
                <p
                  className={`mt-1 text-2xl font-bold tabular-nums ${balance > 0 ? 'text-red-600' : 'text-green-700'}`}
                >
                  {formatGhs(balance)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <svg
                    className="h-4 w-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
                    />
                  </svg>
                  Recent Transactions
                </CardTitle>
                <Link
                  href={`/orders?customerId=${customer.id}`}
                  className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
                >
                  View All
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                </Link>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <p className="px-5 pb-5 pt-3 text-center text-sm text-muted-foreground">
                  No transactions yet for this customer.
                </p>
              ) : (
                <>
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border px-5 py-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Date / Reference
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">Type</span>
                    <span className="text-right text-xs font-medium text-muted-foreground">
                      Amount
                    </span>
                    <span className="text-right text-xs font-medium text-muted-foreground">
                      Status
                    </span>
                  </div>

                  <div className="divide-y divide-border">
                    {transactions.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} />
                    ))}
                  </div>

                  <div className="border-t border-border px-5 py-2.5">
                    <p className="text-xs text-muted-foreground">
                      Showing {transactions.length} of {stats.totalOrders} transactions
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onConfirm={handleDeactivate}
        onCancel={() => setShowConfirm(false)}
        title="Deactivate Customer?"
        message={`${customer.name} will be hidden from your customer list. You can reactivate them later from settings.`}
        confirmLabel={isPending ? 'Deactivating...' : 'Deactivate'}
        cancelLabel="Cancel"
        variant="destructive"
        loading={isPending}
      />
    </div>
  )
}

// ── Transaction row ───────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, string> = {
  invoice: 'bg-blue-100 text-blue-700',
  payment: 'bg-green-100 text-green-700',
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  unpaid: 'bg-gray-100 text-gray-600',
  overdue: 'bg-red-100 text-red-600',
  completed: 'bg-green-100 text-green-700',
}

function TransactionRow({ tx }: { tx: CustomerTransaction }) {
  const date = new Date(tx.date).toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const inner = (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-5 py-3 hover:bg-muted/40">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{tx.reference}</p>
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
      <span
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ${TYPE_STYLES[tx.type] ?? 'bg-gray-100 text-gray-600'}`}
      >
        {tx.type === 'invoice' ? 'Invoice' : 'Payment'}
      </span>
      <p className="text-right text-sm font-semibold tabular-nums text-foreground">
        {formatGhs(tx.amount)}
      </p>
      <span
        className={`inline-flex items-center justify-end rounded-md px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[tx.status] ?? 'bg-gray-100 text-gray-600'}`}
      >
        {tx.status === 'completed'
          ? 'Paid'
          : tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
      </span>
    </div>
  )

  if (tx.orderId) {
    return (
      <Link href={`/orders/${tx.orderId}`} className="block">
        {inner}
      </Link>
    )
  }
  return inner
}
