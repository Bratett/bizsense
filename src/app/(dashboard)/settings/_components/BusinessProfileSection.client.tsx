'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, Loader2 } from 'lucide-react'
import {
  updateBusinessProfile,
  updateBusinessLogo,
  type SettingsActionResult,
  type LogoActionResult,
} from '@/actions/settings'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { BusinessRecord } from '../page.client'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const initialState: SettingsActionResult = { success: false, error: '' }

interface Props {
  business: BusinessRecord
  userRole: string
}

const initialLogoState: LogoActionResult | null = null

export default function BusinessProfileSection({ business, userRole }: Props) {
  const [state, formAction, isPending] = useActionState(updateBusinessProfile, initialState)
  const [logoState, logoFormAction, logoPending] = useActionState(
    updateBusinessLogo,
    initialLogoState,
  )
  const [vatRegistered, setVatRegistered] = useState(business.vatRegistered)
  const [fyMonth, setFyMonth] = useState(business.financialYearStart ?? '1')
  const [previewUrl, setPreviewUrl] = useState<string | null>(business.logoUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fieldErrors = !state.success ? state.fieldErrors : undefined
  const readOnly = userRole === 'accountant'

  useEffect(() => {
    if (state.success) {
      toast.success('Business profile saved')
    }
  }, [state.success])

  useEffect(() => {
    if (logoState?.success) {
      setPreviewUrl(logoState.logoUrl)
      toast.success('Logo updated')
    } else if (logoState && !logoState.success) {
      toast.error(logoState.error)
    }
  }, [logoState])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be 2 MB or smaller')
      e.target.value = ''
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Business Profile</h2>
      <p className="mb-6 text-sm text-gray-500">
        Core business information printed on invoices and used for tax compliance.
      </p>

      {/* Logo upload */}
      {!readOnly && (
        <div className="mb-6 rounded-lg border border-gray-200 p-4">
          <p className="mb-3 text-sm font-medium text-gray-700">Business Logo</p>
          <div className="flex items-center gap-4">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Business logo"
                className="h-16 w-16 rounded-lg object-contain border border-gray-200 bg-gray-50"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
                <ImagePlus className="h-6 w-6 text-gray-400" />
              </div>
            )}
            <form action={logoFormAction} className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                name="logo"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={logoPending}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={logoPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="mr-1.5 h-4 w-4" />
                )}
                {logoPending ? 'Uploading…' : 'Choose Image'}
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="default"
                className="min-h-[44px]"
                disabled={logoPending}
              >
                Upload Logo
              </Button>
            </form>
          </div>
          <p className="mt-2 text-xs text-gray-400">JPEG, PNG, or WebP · Max 2 MB</p>
        </div>
      )}

      {!state.success && <ErrorMessage message={state.error ?? null} className="mb-4" />}

      <form action={formAction} noValidate>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-6 md:gap-y-4">
          {/* Business name */}
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="bp-name">
              Business name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bp-name"
              name="name"
              type="text"
              required
              disabled={isPending || readOnly}
              defaultValue={business.name}
              className={cn('h-11 px-4 text-base', fieldErrors?.name && 'border-destructive')}
            />
            {fieldErrors?.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
          </div>

          {/* Industry */}
          <div className="space-y-1.5">
            <Label htmlFor="bp-industry">Industry</Label>
            <Input
              id="bp-industry"
              name="industry"
              type="text"
              disabled={isPending || readOnly}
              defaultValue={business.industry ?? ''}
              placeholder="e.g. Retail, Wholesale, Services"
              className="h-11 px-4 text-base"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="bp-phone">Phone</Label>
            <Input
              id="bp-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              disabled={isPending || readOnly}
              defaultValue={business.phone ?? ''}
              placeholder="0241234567"
              className="h-11 px-4 text-base"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="bp-email">Email</Label>
            <Input
              id="bp-email"
              name="email"
              type="email"
              inputMode="email"
              disabled={isPending || readOnly}
              defaultValue={business.email ?? ''}
              placeholder="info@yourbusiness.com"
              className={cn('h-11 px-4 text-base', fieldErrors?.email && 'border-destructive')}
            />
            {fieldErrors?.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>

          {/* Address */}
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="bp-address">Address</Label>
            <Input
              id="bp-address"
              name="address"
              type="text"
              disabled={isPending || readOnly}
              defaultValue={business.address ?? ''}
              placeholder="Location / street address"
              className="h-11 px-4 text-base"
            />
          </div>

          {/* GRA TIN */}
          <div className="space-y-1.5">
            <Label htmlFor="bp-tin">GRA TIN</Label>
            <Input
              id="bp-tin"
              name="tin"
              type="text"
              disabled={isPending || readOnly}
              defaultValue={business.tin ?? ''}
              placeholder="C0012345678"
              className="h-11 px-4 text-base"
            />
          </div>

          {/* SSNIT number */}
          <div className="space-y-1.5">
            <Label htmlFor="bp-ssnit">SSNIT Number</Label>
            <Input
              id="bp-ssnit"
              name="ssnitNumber"
              type="text"
              disabled={isPending || readOnly}
              defaultValue={business.ssnitNumber ?? ''}
              placeholder="SSNIT employer number"
              className="h-11 px-4 text-base"
            />
          </div>

          {/* VAT registered */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center gap-3">
              <input
                id="bp-vat-registered"
                name="vatRegistered"
                type="checkbox"
                checked={vatRegistered}
                onChange={(e) => setVatRegistered(e.target.checked)}
                disabled={isPending || readOnly}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <Label htmlFor="bp-vat-registered" className="cursor-pointer font-normal">
                This business is VAT registered
              </Label>
            </div>
          </div>

          {/* VAT number — conditional */}
          {vatRegistered && (
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="bp-vat-number">
                VAT Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bp-vat-number"
                name="vatNumber"
                type="text"
                disabled={isPending || readOnly}
                defaultValue={business.vatNumber ?? ''}
                placeholder="VAT registration number"
                className={cn(
                  'h-11 px-4 text-base',
                  fieldErrors?.vatNumber && 'border-destructive',
                )}
              />
              {fieldErrors?.vatNumber && (
                <p className="text-xs text-destructive">{fieldErrors.vatNumber}</p>
              )}
            </div>
          )}

          {/* Financial year start */}
          <div className="space-y-1.5">
            <Label htmlFor="bp-fy">Financial Year Start</Label>
            <Select
              name="financialYearStart"
              value={fyMonth}
              onValueChange={(v) => setFyMonth(v ?? '1')}
              disabled={isPending || readOnly}
            >
              <SelectTrigger id="bp-fy" className="h-11">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          {!readOnly && (
            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={isPending}
                className="h-11 w-full text-base font-semibold md:w-auto"
              >
                {isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          )}

          {readOnly && (
            <p className="text-xs text-gray-400 md:col-span-2">
              You have read-only access to business profile settings.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
