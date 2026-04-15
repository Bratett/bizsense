'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  deactivateSupplier,
  type SupplierWithBalance,
  type SupplierStats,
  type SupplierTransaction,
} from '@/actions/suppliers'
import { getSupplierStatementData } from '@/actions/supplierPayments'
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
import { ClipboardList, Download, Pencil, MapPin, Phone, Mail, Smartphone, Building2 } from 'lucide-react'
import { WhatsAppButton } from '@/components/whatsapp/WhatsAppButton'
import { customerStatementTemplate } from '@/lib/whatsapp/templates'

function formatGhsCompact(amount: number): string {
  if (amount >= 1_000_000) return `GHS ${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `GHS ${(amount / 1_000).toFixed(1)}k`
  return formatGhs(amount)
}

export default function SupplierDetail({
  supplier,
  stats,
  transactions,
  businessName,
}: {
  supplier: SupplierWithBalance
  stats: SupplierStats
  transactions: SupplierTransaction[]
  businessName: string
}) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  async function handleDownloadStatement() {
    setIsGeneratingPdf(true)
    try {
      const data = await getSupplierStatementData(supplier.id)
      const worker = new Worker(new URL('@/lib/pdf/supplierStatement.worker.ts', import.meta.url))
      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'success') {
          const url = URL.createObjectURL(e.data.blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `statement-${supplier.name.replace(/\s+/g, '-').toLowerCase()}.pdf`
          a.click()
          URL.revokeObjectURL(url)
        }
        worker.terminate()
        setIsGeneratingPdf(false)
      }
      worker.onerror = () => {
        worker.terminate()
        setIsGeneratingPdf(false)
      }
      worker.postMessage({ type: 'generate', data })
    } catch {
      setIsGeneratingPdf(false)
    }
  }

  function handleDeactivate() {
    setDeactivateError(null)
    startTransition(async () => {
      const result = await deactivateSupplier(supplier.id)
      if (result.success) {
        router.push('/suppliers')
      } else {
        setShowConfirm(false)
        setDeactivateError(result.error)
      }
    })
  }

  const balanceIsZero = supplier.outstandingPayable === 0
  const color = avatarColor(supplier.name)
  const inits = initials(supplier.name)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/suppliers" />}>Suppliers</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{supplier.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title={supplier.name} backHref="/suppliers" />

      {deactivateError && (
        <Alert variant="destructive">
          <AlertDescription>{deactivateError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* ── Left: Contact card (2 cols) ── */}
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
                <h2 className="mt-3 text-lg font-semibold text-foreground">{supplier.name}</h2>
                {!supplier.isActive && (
                  <Badge variant="secondary" className="mt-1">
                    Inactive
                  </Badge>
                )}
                {supplier.location && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {supplier.location}
                  </p>
                )}
              </div>

              <Separator className="my-4" />

              {/* Contact rows */}
              <div className="space-y-1">
                {supplier.phone && (
                  <a
                    href={`tel:${supplier.phone}`}
                    className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
                      <Phone className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">PHONE</p>
                      <p className="text-sm font-medium text-green-700">{supplier.phone}</p>
                    </div>
                  </a>
                )}
                {supplier.email && (
                  <a
                    href={`mailto:${supplier.email}`}
                    className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Mail className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">EMAIL</p>
                      <p className="truncate text-sm font-medium text-foreground">{supplier.email}</p>
                    </div>
                  </a>
                )}
                {supplier.momoNumber && (
                  <div className="flex items-center gap-3 rounded-lg p-1.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <Smartphone className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">MOMO</p>
                      <p className="text-sm font-medium text-foreground">{supplier.momoNumber}</p>
                    </div>
                  </div>
                )}
                {(supplier.bankName || supplier.bankAccount) && (
                  <div className="flex items-center gap-3 rounded-lg p-1.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">BANK</p>
                      <p className="text-sm font-medium text-foreground">
                        {supplier.bankName}
                        {supplier.bankAccount && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            · {supplier.bankAccount}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
                {supplier.notes && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">NOTES</p>
                    <p className="text-sm text-foreground">{supplier.notes}</p>
                  </div>
                )}
              </div>

              {/* Credit Terms */}
              {supplier.creditTermsDays !== null && supplier.creditTermsDays !== undefined && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Credit Terms</span>
                    <Badge variant="secondary">
                      {supplier.creditTermsDays === 0
                        ? 'Payment on receipt'
                        : `${supplier.creditTermsDays} days`}
                    </Badge>
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="mt-5 space-y-2">
                <Button
                  className="h-11 w-full text-sm font-semibold"
                  render={<Link href={`/purchase-orders/new?supplierId=${supplier.id}`} />}
                >
                  <ClipboardList className="h-4 w-4" />
                  Create Purchase Order
                </Button>

                {supplier.outstandingPayable > 0 && (
                  <Button
                    variant="outline"
                    render={<Link href={`/purchase-orders?supplierId=${supplier.id}&recordPayment=true`} />}
                    className="h-11 w-full border-green-200 text-sm font-semibold text-green-700 hover:bg-green-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                    Record Payment
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="h-10 w-full text-sm font-medium"
                  onClick={handleDownloadStatement}
                  disabled={isGeneratingPdf}
                >
                  <Download className="h-4 w-4" />
                  {isGeneratingPdf ? 'Generating PDF...' : 'Download Statement'}
                </Button>

                {supplier.phone && supplier.outstandingPayable > 0 && (
                  <WhatsAppButton
                    phone={supplier.phone}
                    message={customerStatementTemplate({
                      businessName,
                      customerName: supplier.name,
                      outstandingTotal: supplier.outstandingPayable,
                      invoiceCount: stats.totalPurchaseOrders,
                    })}
                    label="Share Statement via WhatsApp"
                    variant="secondary"
                    className="h-10 w-full"
                  />
                )}

                <Button
                  variant="outline"
                  className="h-10 w-full text-sm font-medium"
                  render={<Link href={`/suppliers/${supplier.id}/edit`} />}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>

                {supplier.isActive && (
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirm(true)}
                    className="h-10 w-full border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    Deactivate Supplier
                  </Button>
                )}
              </div>

              {/* Financial Performance */}
              {stats.totalPurchaseOrders > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Financial Performance
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs text-muted-foreground">Lifetime Spend</p>
                        <p className="mt-0.5 text-base font-bold text-foreground">
                          {formatGhsCompact(stats.lifetimeSpend)}
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
            {/* Total POs */}
            <Card className="border-l-4 border-l-green-600">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Purchase Orders
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {stats.totalPurchaseOrders}
                </p>
                {stats.posThisMonth > 0 && (
                  <p className="mt-1 text-xs text-green-600">
                    +{stats.posThisMonth} this month
                  </p>
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

            {/* Outstanding Payable */}
            <Card
              className={
                balanceIsZero
                  ? 'border-l-4 border-l-green-600'
                  : 'border-l-4 border-l-amber-400'
              }
            >
              <CardContent className="p-4">
                <p
                  className={`text-xs font-semibold uppercase tracking-wider ${balanceIsZero ? 'text-muted-foreground' : 'text-amber-600'}`}
                >
                  Outstanding
                </p>
                <p
                  className={`mt-1 text-2xl font-bold tabular-nums ${balanceIsZero ? 'text-green-700' : 'text-amber-700'}`}
                >
                  {formatGhs(supplier.outstandingPayable)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                  </svg>
                  Recent Transactions
                </CardTitle>
                <Link
                  href={`/purchase-orders?supplierId=${supplier.id}`}
                  className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
                >
                  View All
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </Link>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <p className="px-5 pb-5 pt-3 text-center text-sm text-muted-foreground">
                  No transactions yet for this supplier.
                </p>
              ) : (
                <>
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border px-5 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Date / Reference</span>
                    <span className="text-xs font-medium text-muted-foreground">Type</span>
                    <span className="text-right text-xs font-medium text-muted-foreground">Amount</span>
                    <span className="text-right text-xs font-medium text-muted-foreground">Status</span>
                  </div>

                  <div className="divide-y divide-border">
                    {transactions.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} />
                    ))}
                  </div>

                  <div className="border-t border-border px-5 py-2.5">
                    <p className="text-xs text-muted-foreground">
                      Showing {transactions.length} of {stats.totalPurchaseOrders} transactions
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
        title="Deactivate Supplier?"
        message={`${supplier.name} will be hidden from your supplier list. You can reactivate them later from settings.`}
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
  purchase_order: 'bg-blue-100 text-blue-700',
  payment: 'bg-green-100 text-green-700',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  completed: 'bg-green-100 text-green-700',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
  completed: 'Paid',
}

function TransactionRow({ tx }: { tx: SupplierTransaction }) {
  const date = tx.date
    ? new Date(tx.date).toLocaleDateString('en-GH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—'

  const inner = (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-5 py-3 hover:bg-muted/40">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{tx.reference}</p>
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
      <span
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[tx.type] ?? 'bg-gray-100 text-gray-600'}`}
      >
        {tx.type === 'purchase_order' ? 'PO' : 'Payment'}
      </span>
      <p className="text-right text-sm font-semibold tabular-nums text-foreground">
        {formatGhs(tx.amount)}
      </p>
      <span
        className={`inline-flex items-center justify-end rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[tx.status] ?? 'bg-gray-100 text-gray-600'}`}
      >
        {STATUS_LABELS[tx.status] ?? tx.status}
      </span>
    </div>
  )

  if (tx.poId) {
    return (
      <Link href={`/purchase-orders/${tx.poId}`} className="block">
        {inner}
      </Link>
    )
  }
  return inner
}
