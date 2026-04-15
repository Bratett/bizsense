'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  updateSupplier,
  type SupplierActionResult,
  type SupplierWithBalance,
} from '@/actions/suppliers'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

const initialState: SupplierActionResult = { success: false, error: '' }

export default function EditSupplierForm({ supplier }: { supplier: SupplierWithBalance }) {
  const [state, formAction, isPending] = useActionState(updateSupplier, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.success) {
      router.push(`/suppliers/${supplier.id}`)
    }
  }, [state.success, router, supplier.id])

  const fieldErrors = !state.success ? state.fieldErrors : undefined

  return (
    <>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/suppliers" />}>Suppliers</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/suppliers/${supplier.id}`} />}>
              {supplier.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <PageHeader title="Edit Supplier" backHref={`/suppliers/${supplier.id}`} />

      {/* General error */}
      {!state.success && state.error && !state.fieldErrors && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form
        action={formAction}
        className="space-y-4 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-4 md:space-y-0"
      >
        {/* Hidden ID */}
        <input type="hidden" name="id" value={supplier.id} />

        {/* Name */}
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            maxLength={255}
            defaultValue={supplier.name}
            aria-invalid={!!fieldErrors?.name}
            className={cn(fieldErrors?.name && 'border-destructive')}
          />
          {fieldErrors?.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            defaultValue={supplier.phone ?? ''}
            placeholder="e.g. 0241234567"
            aria-invalid={!!fieldErrors?.phone}
            className={cn(fieldErrors?.phone && 'border-destructive')}
          />
          {fieldErrors?.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={supplier.email ?? ''} />
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            type="text"
            defaultValue={supplier.location ?? ''}
            placeholder="e.g. Tema Industrial Area"
          />
        </div>

        {/* MoMo Number */}
        <div className="space-y-1.5">
          <Label htmlFor="momoNumber">Mobile Money Number</Label>
          <Input
            id="momoNumber"
            name="momoNumber"
            type="tel"
            inputMode="tel"
            defaultValue={supplier.momoNumber ?? ''}
            placeholder="e.g. 0241234567"
          />
        </div>

        {/* Bank Name */}
        <div className="space-y-1.5">
          <Label htmlFor="bankName">Bank Name</Label>
          <Input
            id="bankName"
            name="bankName"
            type="text"
            defaultValue={supplier.bankName ?? ''}
            placeholder="e.g. GCB Bank"
          />
        </div>

        {/* Bank Account */}
        <div className="space-y-1.5">
          <Label htmlFor="bankAccount">Bank Account Number</Label>
          <Input
            id="bankAccount"
            name="bankAccount"
            type="text"
            defaultValue={supplier.bankAccount ?? ''}
            placeholder="e.g. 1234567890"
          />
        </div>

        {/* Credit Terms */}
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="creditTermsDays">
            Credit Terms (days) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="creditTermsDays"
            name="creditTermsDays"
            type="number"
            inputMode="numeric"
            min={0}
            step="1"
            defaultValue={supplier.creditTermsDays}
            aria-invalid={!!fieldErrors?.creditTermsDays}
            className={cn(fieldErrors?.creditTermsDays && 'border-destructive')}
          />
          <p className="text-xs text-muted-foreground">0 = payment due on receipt</p>
          {fieldErrors?.creditTermsDays && (
            <p className="text-sm text-destructive">{fieldErrors.creditTermsDays}</p>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={supplier.notes ?? ''}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
        </div>

        {/* Submit */}
        <Button type="submit" disabled={isPending} className="w-full md:col-span-2">
          {isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>
    </>
  )
}
