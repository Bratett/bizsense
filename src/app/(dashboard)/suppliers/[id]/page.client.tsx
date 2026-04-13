'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { deactivateSupplier, type SupplierWithBalance } from '@/actions/suppliers'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { getSupplierStatementData } from '@/actions/supplierPayments'
import { formatGhs, avatarColor, initials } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { Pencil, Download, ClipboardList, MapPin, Phone, Mail, Smartphone, Building2 } from 'lucide-react'

export default function SupplierDetail({ supplier }: { supplier: SupplierWithBalance }) {
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
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <Breadcrumb className="mb-4">
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

        {/* Back nav */}
        <PageHeader
          title={supplier.name}
          backHref="/suppliers"
        />

        {/* Deactivate error */}
        {deactivateError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{deactivateError}</AlertDescription>
          </Alert>
        )}

        {/* Two-column layout */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[300px,1fr]">
          {/* -- Left Sidebar -- */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardContent>
                {/* Avatar + name */}
                <div className="flex flex-col items-center text-center">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className={cn('text-xl font-bold text-white', color)}>
                      {inits}
                    </AvatarFallback>
                  </Avatar>
                  <h2 className="mt-3 text-lg font-semibold text-foreground">{supplier.name}</h2>
                  {!supplier.isActive && (
                    <Badge variant="secondary" className="mt-1">Inactive</Badge>
                  )}
                  {supplier.location && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {supplier.location}
                    </div>
                  )}
                </div>

                <Separator className="my-4" />

                {/* Contact rows */}
                <div className="space-y-3">
                  {supplier.phone && (
                    <a
                      href={`tel:${supplier.phone}`}
                      className="flex items-center gap-3 rounded-lg p-1.5 text-sm hover:bg-muted"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
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
                      className="flex items-center gap-3 rounded-lg p-1.5 text-sm hover:bg-muted"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
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
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
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
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">BANK</p>
                        <p className="text-sm font-medium text-foreground">
                          {supplier.bankName}
                          {supplier.bankAccount && (
                            <span className="ml-1 text-xs text-muted-foreground">· {supplier.bankAccount}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Credit Terms chip */}
                {(supplier.creditTermsDays !== null && supplier.creditTermsDays !== undefined) && (
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
                  <Button className="w-full" render={<Link href={`/purchase-orders/new?supplierId=${supplier.id}`} />}>
                    <ClipboardList className="h-4 w-4" />
                    Create PO
                  </Button>
                  <Button variant="outline" className="w-full" render={<Link href={`/suppliers/${supplier.id}/edit`} />}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleDownloadStatement}
                    disabled={isGeneratingPdf}
                  >
                    <Download className="h-4 w-4" />
                    {isGeneratingPdf ? 'Generating PDF...' : 'Download Statement'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* -- Right Column -- */}
          <div className="flex flex-col gap-4">
            {/* Stat cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Outstanding Payable */}
              <div
                className={cn(
                  'rounded-2xl border p-4 sm:col-span-1',
                  balanceIsZero ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50',
                )}
              >
                <p className={cn('text-xs font-semibold uppercase tracking-wider', balanceIsZero ? 'text-green-600' : 'text-amber-600')}>
                  Outstanding Payable
                </p>
                <p className={cn('mt-1 text-2xl font-bold tabular-nums', balanceIsZero ? 'text-green-700' : 'text-amber-700')}>
                  {formatGhs(supplier.outstandingPayable)}
                </p>
              </div>

              {/* Credit Terms */}
              <Card>
                <CardContent>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Credit Terms</p>
                  <p className="mt-1 text-base font-bold text-foreground">
                    {supplier.creditTermsDays === 0
                      ? 'On receipt'
                      : `${supplier.creditTermsDays} days`}
                  </p>
                </CardContent>
              </Card>

              {/* Supplier Since */}
              <Card>
                <CardContent>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier Since</p>
                  <p className="mt-1 text-base font-bold text-foreground">
                    {supplier.createdAt.toLocaleDateString('en-GH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Profile details card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Profile Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-border">
                  <ProfileRow label="Name" value={supplier.name} />
                  {supplier.phone && <ProfileRow label="Phone" value={supplier.phone} />}
                  {supplier.email && <ProfileRow label="Email" value={supplier.email} />}
                  {supplier.location && <ProfileRow label="Location" value={supplier.location} />}
                  {supplier.momoNumber && <ProfileRow label="MoMo Number" value={supplier.momoNumber} />}
                  {supplier.bankName && <ProfileRow label="Bank Name" value={supplier.bankName} />}
                  {supplier.bankAccount && <ProfileRow label="Bank Account" value={supplier.bankAccount} />}
                  <ProfileRow
                    label="Credit Terms"
                    value={
                      supplier.creditTermsDays === 0
                        ? 'Payment on receipt'
                        : `${supplier.creditTermsDays} days`
                    }
                  />
                  {supplier.notes && <ProfileRow label="Notes" value={supplier.notes} />}
                </dl>
              </CardContent>
            </Card>

            {/* Deactivate */}
            {supplier.isActive && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowConfirm(true)}
              >
                Deactivate Supplier
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground">Deactivate Supplier?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {supplier.name} will be hidden from your supplier list. You can reactivate them later
                from settings.
              </p>
              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowConfirm(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDeactivate}
                  disabled={isPending}
                >
                  {isPending ? 'Deactivating...' : 'Deactivate'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

function ProfileRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between py-2.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="ml-4 max-w-[60%] text-right text-sm text-foreground">{value}</dd>
    </div>
  )
}
