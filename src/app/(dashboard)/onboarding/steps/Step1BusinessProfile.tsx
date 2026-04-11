'use client'

import { useState, useTransition, useRef } from 'react'
import { completeOnboardingStep1 } from '@/actions/onboarding'

const INDUSTRIES = ['Retail', 'Trading', 'Food & Beverage', 'Services', 'Wholesale', 'Other']

const YEAR_START_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '4', label: 'April' },
  { value: '7', label: 'July' },
  { value: '10', label: 'October' },
]

type Props = {
  onComplete: () => void
}

export default function Step1BusinessProfile({ onComplete }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [industry, setIndustry] = useState('Retail')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [tin, setTin] = useState('')
  const [vatRegistered, setVatRegistered] = useState(false)
  const [vatNumber, setVatNumber] = useState('')
  const [vatEffectiveDate, setVatEffectiveDate] = useState(new Date().toISOString().split('T')[0])
  const [financialYearStart, setFinancialYearStart] = useState('1')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setFieldErrors((prev) => ({ ...prev, logo: 'Only PNG or JPG files allowed' }))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, logo: 'Logo must be under 2MB' }))
      return
    }
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next.logo
      return next
    })
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  function handleSubmit() {
    setError('')
    setFieldErrors({})

    // Client-side validation
    const errors: Record<string, string> = {}
    if (!phone.trim()) errors.phone = 'Business phone is required'
    if (vatRegistered && !vatNumber.trim()) {
      errors.vatNumber = 'VAT number is required for VAT-registered businesses'
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('industry', industry)
      formData.set('address', address)
      formData.set('phone', phone)
      formData.set('email', email)
      formData.set('tin', tin)
      formData.set('vatRegistered', String(vatRegistered))
      formData.set('vatNumber', vatNumber)
      formData.set('vatEffectiveDate', vatEffectiveDate)
      formData.set('financialYearStart', financialYearStart)
      if (logoFile) formData.set('logo', logoFile)

      const result = await completeOnboardingStep1(formData)
      if (result.success) {
        onComplete()
      } else {
        setError(result.error)
        if ('fieldErrors' in result && result.fieldErrors) {
          setFieldErrors(result.fieldErrors)
        }
      }
    })
  }

  const inputClass = (field: string) =>
    `w-full rounded-lg border px-4 py-3 text-base text-gray-900 placeholder:text-gray-400
     focus:outline-none focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400
     ${fieldErrors[field] ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-green-600'}`

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Business Profile</h2>
      <p className="mt-1 text-sm text-gray-500">
        Tell us about your business so we can set things up correctly.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {/* Industry */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="industry" className="text-sm font-medium text-gray-700">
            Industry
          </label>
          <select
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={isPending}
            className={inputClass('industry')}
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        {/* Location/Area */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="address" className="text-sm font-medium text-gray-700">
            Location / Area
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={isPending}
            placeholder="e.g. Accra, Tema"
            className={inputClass('address')}
          />
        </div>

        {/* Business Phone */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-gray-700">
            Business Phone <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isPending}
            placeholder="0XX XXX XXXX"
            className={inputClass('phone')}
          />
          {fieldErrors.phone && <p className="text-sm text-red-600">{fieldErrors.phone}</p>}
        </div>

        {/* Business Email */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">
            Business Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            placeholder="shop@example.com"
            className={inputClass('email')}
          />
        </div>

        {/* GRA TIN */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tin" className="text-sm font-medium text-gray-700">
            GRA TIN
            <span className="ml-1 font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="tin"
            type="text"
            value={tin}
            onChange={(e) => setTin(e.target.value)}
            disabled={isPending}
            placeholder="Tax Identification Number"
            className={inputClass('tin')}
          />
          <p className="text-xs text-gray-400">Required for VAT invoices</p>
        </div>

        {/* VAT Registered toggle */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
          <div>
            <span className="text-sm font-medium text-gray-700">VAT Registered?</span>
            <p className="text-xs text-gray-400">Toggle if your business charges VAT</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={vatRegistered}
            onClick={() => setVatRegistered(!vatRegistered)}
            disabled={isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                       transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-100
                       ${vatRegistered ? 'bg-green-600' : 'bg-gray-200'}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0
                         transition-transform duration-200 ${vatRegistered ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {/* VAT fields (conditional) */}
        {vatRegistered && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vatNumber" className="text-sm font-medium text-gray-700">
                VAT Number <span className="text-red-500">*</span>
              </label>
              <input
                id="vatNumber"
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                disabled={isPending}
                className={inputClass('vatNumber')}
              />
              {fieldErrors.vatNumber && (
                <p className="text-sm text-red-600">{fieldErrors.vatNumber}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vatEffectiveDate" className="text-sm font-medium text-gray-700">
                VAT Effective Date
              </label>
              <input
                id="vatEffectiveDate"
                type="date"
                value={vatEffectiveDate}
                onChange={(e) => setVatEffectiveDate(e.target.value)}
                disabled={isPending}
                className={inputClass('vatEffectiveDate')}
              />
            </div>
          </>
        )}

        {/* Financial Year Start */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="financialYearStart" className="text-sm font-medium text-gray-700">
            Financial Year Starts
          </label>
          <select
            id="financialYearStart"
            value={financialYearStart}
            onChange={(e) => setFinancialYearStart(e.target.value)}
            disabled={isPending}
            className={inputClass('financialYearStart')}
          >
            {YEAR_START_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400">Most Ghanaian SMEs use January</p>
        </div>

        {/* Logo upload */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            Logo
            <span className="ml-1 font-normal text-gray-400">(optional)</span>
          </label>
          <div className="flex items-center gap-3">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo preview"
                className="h-12 w-12 rounded-lg border border-gray-200 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
                <span className="text-xs text-gray-400">Logo</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700
                         hover:bg-gray-50 disabled:opacity-50"
            >
              {logoPreview ? 'Change' : 'Upload'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleLogoChange}
              className="hidden"
            />
          </div>
          {fieldErrors.logo && <p className="text-sm text-red-600">{fieldErrors.logo}</p>}
          <p className="text-xs text-gray-400">PNG or JPG, max 2MB</p>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="mt-2 w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white
                     transition-colors hover:bg-green-800 active:bg-green-900
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Saving\u2026' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
