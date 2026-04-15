'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCustomer, type CustomerActionResult } from '@/actions/customers'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'
import { withOfflineFallback } from '@/lib/offline/withOfflineFallback'
import { writeCustomerOffline } from '@/lib/offline/offlineCustomers'
import { mirrorCustomerToDexie } from '@/lib/offline/mirror'

const initialState: CustomerActionResult = { success: false, error: '' }

export default function CustomerForm({ businessId }: { businessId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const router = useRouter()

  // ─── Controlled form state ─────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [location, setLocation] = useState('')
  const [momoNumber, setMomoNumber] = useState('')
  const [creditLimit, setCreditLimit] = useState('0')
  const [notes, setNotes] = useState('')

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    setError(null)
    setFieldErrors({})

    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('name', name)
        fd.set('phone', phone)
        fd.set('email', email)
        fd.set('location', location)
        fd.set('momoNumber', momoNumber)
        fd.set('creditLimit', creditLimit)
        fd.set('notes', notes)

        const result = await withOfflineFallback(
          () => createCustomer(initialState, fd),
          () =>
            writeCustomerOffline({
              businessId,
              name,
              phone,
              email: email || null,
              location: location || null,
              momoNumber: momoNumber || null,
              creditLimit: Number(creditLimit) || 0,
              notes: notes || null,
            }).then((customerId) => ({ success: true as const, customerId })),
        )

        if (result.success) {
          if (!result.wasOffline) {
            mirrorCustomerToDexie(
              { customerId: result.customerId ?? '' },
              {
                name,
                phone,
                email: email || null,
                location: location || null,
                momoNumber: momoNumber || null,
                creditLimit: Number(creditLimit) || 0,
                notes: notes || null,
              },
            ).catch(() => {})
          }
          router.push('/customers')
        } else {
          setError(result.error ?? null)
          if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    })
  }

  return (
    <>
      <PageHeader title="Add Customer" backHref="/customers" />

      {/* General error */}
      {error && !Object.keys(fieldErrors).length && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-4 md:space-y-0">
        {/* Name */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            type="text"
            required
            maxLength={255}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(
              'h-11 px-4 text-base',
              fieldErrors.name && 'border-destructive focus-visible:ring-destructive/20',
            )}
            placeholder="e.g. Ama Serwaa"
          />
          {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">
            Phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={cn(
              'h-11 px-4 text-base',
              fieldErrors.phone && 'border-destructive focus-visible:ring-destructive/20',
            )}
            placeholder="e.g. 0241234567"
          />
          {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 px-4 text-base"
            placeholder="e.g. ama@example.com"
          />
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="h-11 px-4 text-base"
            placeholder="e.g. Madina Market, Tema Comm. 1"
          />
        </div>

        {/* MoMo Number */}
        <div className="space-y-2">
          <Label htmlFor="momoNumber">Mobile Money Number</Label>
          <Input
            id="momoNumber"
            type="tel"
            inputMode="tel"
            value={momoNumber}
            onChange={(e) => setMomoNumber(e.target.value)}
            className="h-11 px-4 text-base"
            placeholder="e.g. 0241234567"
          />
        </div>

        {/* Credit Limit */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="creditLimit">Credit Limit (GHS)</Label>
          <Input
            id="creditLimit"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            className={cn(
              'h-11 px-4 text-base',
              fieldErrors.creditLimit && 'border-destructive focus-visible:ring-destructive/20',
            )}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground">0 = cash only, no credit</p>
          {fieldErrors.creditLimit && (
            <p className="text-sm text-destructive">{fieldErrors.creditLimit}</p>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-input bg-transparent px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            placeholder="Any notes about this customer"
          />
        </div>

        {/* Submit */}
        <Button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="h-11 w-full text-base font-semibold md:col-span-2"
        >
          {isPending ? 'Saving...' : 'Save Customer'}
        </Button>
      </div>
    </>
  )
}
