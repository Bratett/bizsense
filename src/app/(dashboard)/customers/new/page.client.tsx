'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createCustomer, type CustomerActionResult } from '@/actions/customers'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

const initialState: CustomerActionResult = { success: false, error: '' }

export default function CustomerForm() {
  const [state, formAction, isPending] = useActionState(createCustomer, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.success) {
      router.push('/customers')
    }
  }, [state.success, router])

  const fieldErrors = !state.success ? state.fieldErrors : undefined

  return (
    <>
      <PageHeader title="Add Customer" backHref="/customers" />

      {/* General error */}
      {!state.success && state.error && !state.fieldErrors && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            maxLength={255}
            className={cn(
              'h-11 px-4 text-base',
              fieldErrors?.name && 'border-destructive focus-visible:ring-destructive/20',
            )}
            placeholder="e.g. Ama Serwaa"
          />
          {fieldErrors?.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            className={cn(
              'h-11 px-4 text-base',
              fieldErrors?.phone && 'border-destructive focus-visible:ring-destructive/20',
            )}
            placeholder="e.g. 0241234567"
          />
          {fieldErrors?.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            className="h-11 px-4 text-base"
            placeholder="e.g. ama@example.com"
          />
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            type="text"
            className="h-11 px-4 text-base"
            placeholder="e.g. Madina Market, Tema Comm. 1"
          />
        </div>

        {/* MoMo Number */}
        <div className="space-y-2">
          <Label htmlFor="momoNumber">Mobile Money Number</Label>
          <Input
            id="momoNumber"
            name="momoNumber"
            type="tel"
            inputMode="tel"
            className="h-11 px-4 text-base"
            placeholder="e.g. 0241234567"
          />
        </div>

        {/* Credit Limit */}
        <div className="space-y-2">
          <Label htmlFor="creditLimit">Credit Limit (GHS)</Label>
          <Input
            id="creditLimit"
            name="creditLimit"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            defaultValue="0"
            className={cn(
              'h-11 px-4 text-base',
              fieldErrors?.creditLimit && 'border-destructive focus-visible:ring-destructive/20',
            )}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground">0 = cash only, no credit</p>
          {fieldErrors?.creditLimit && (
            <p className="text-sm text-destructive">{fieldErrors.creditLimit}</p>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            placeholder="Any notes about this customer"
          />
        </div>

        {/* Submit */}
        <Button type="submit" disabled={isPending} className="h-11 w-full text-base font-semibold">
          {isPending ? 'Saving...' : 'Save Customer'}
        </Button>
      </form>
    </>
  )
}
