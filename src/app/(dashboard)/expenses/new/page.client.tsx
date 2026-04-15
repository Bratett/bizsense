'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  createExpense,
  previewExpenseVat,
  type PaymentMethod,
  type CreateExpenseInput,
  type RecurrenceFrequency,
} from '@/actions/expenses'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'
import type { UserRole } from '@/lib/session'
import { formatGhs } from '@/lib/format'
import { withOfflineFallback } from '@/lib/offline/withOfflineFallback'
import { writeExpenseOffline } from '@/lib/offline/offlineExpenses'
import { mirrorExpenseToDexie } from '@/lib/offline/mirror'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ErrorMessage } from '@/components/ErrorMessage'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/ui/page-header'

// ─── Constants ───────────────────────────────────────────────────────────────

type PaymentOption = {
  value: PaymentMethod
  label: string
  requiresRef: boolean
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { value: 'cash', label: 'Cash', requiresRef: false },
  { value: 'momo_mtn', label: 'MTN MoMo', requiresRef: true },
  { value: 'momo_telecel', label: 'Telecel', requiresRef: true },
  { value: 'momo_airtel', label: 'AirtelTigo', requiresRef: true },
  { value: 'bank', label: 'Bank', requiresRef: true },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewExpenseForm({
  vatRegistered,
  userRole,
  businessId,
}: {
  vatRegistered: boolean
  userRole: UserRole
  businessId: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState<string | null>(null)

  // ─── Form state ───────────────────────────────────────────────────────────
  const [expenseDate, setExpenseDate] = useState(todayISO())
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [momoReference, setMomoReference] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [includesVat, setIncludesVat] = useState(false)
  const [notes, setNotes] = useState('')
  const [capitalAcknowledged, setCapitalAcknowledged] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('monthly')
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [_receiptFile, setReceiptFile] = useState<File | null>(null)

  // ─── VAT preview ──────────────────────────────────────────────────────────
  const [vatPreview, setVatPreview] = useState<{
    netAmount: number
    vatAmount: number
  } | null>(null)

  const amountNum = parseFloat(amount) || 0
  const isCapital = category === 'asset_purchase'

  useEffect(() => {
    if (!includesVat || amountNum <= 0 || isCapital) {
      setVatPreview(null)
      return
    }
    const timeout = setTimeout(() => {
      previewExpenseVat(amountNum)
        .then(setVatPreview)
        .catch(() => setVatPreview(null))
    }, 300)
    return () => clearTimeout(timeout)
  }, [includesVat, amountNum, isCapital])

  // Reset capital acknowledgment when category changes
  useEffect(() => {
    if (!isCapital) setCapitalAcknowledged(false)
  }, [isCapital])

  // ─── Validation ───────────────────────────────────────────────────────────
  const selectedOption = PAYMENT_OPTIONS.find((o) => o.value === paymentMethod)
  const canSubmit =
    category &&
    amountNum > 0 &&
    description.trim().length >= 3 &&
    (!selectedOption?.requiresRef ||
      (paymentMethod.startsWith('momo_') ? momoReference.trim() : bankReference.trim())) &&
    (!isCapital || capitalAcknowledged)

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    setError(null)
    setFieldErrors({})
    setSuccess(null)

    startTransition(async () => {
      try {
        const input: CreateExpenseInput = {
          expenseDate,
          category,
          amount: amountNum,
          paymentMethod,
          description: description.trim(),
          includesVat: includesVat && !isCapital,
          isCapitalExpense: isCapital,
          momoReference: momoReference.trim() || undefined,
          bankReference: bankReference.trim() || undefined,
          notes: notes.trim() || undefined,
          isRecurring: isRecurring && !isCapital,
          recurrenceFrequency: isRecurring && !isCapital ? recurrenceFrequency : undefined,
        }

        const approvalStatus = userRole === 'cashier' ? 'pending_approval' : 'approved'

        const result = await withOfflineFallback(
          () => createExpense(input),
          () =>
            writeExpenseOffline({
              ...input,
              businessId,
              approvalStatus,
            }).then((expenseId) => ({ success: true as const, expenseId })),
        )

        if (result.success) {
          if (!result.wasOffline) {
            mirrorExpenseToDexie({ expenseId: result.expenseId }, input, approvalStatus).catch(
              () => {},
            )
          }

          const catLabel = EXPENSE_CATEGORIES.find((c) => c.key === category)?.label ?? category
          const offlineNote = result.wasOffline
            ? ' (saved offline — will sync when reconnected)'
            : ''
          setSuccess(
            `Expense recorded. ${formatGhs(amountNum)} ${catLabel} on ${expenseDate}.${offlineNote}`,
          )

          // Reset form
          setCategory('')
          setAmount('')
          setDescription('')
          setPaymentMethod('cash')
          setMomoReference('')
          setBankReference('')
          setIncludesVat(false)
          setNotes('')
          setCapitalAcknowledged(false)
          setIsRecurring(false)
          setRecurrenceFrequency('monthly')
          setReceiptPreview(null)
          setReceiptFile(null)
          setExpenseDate(todayISO())
        } else {
          setError(result.error)
          if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        }
      } catch (err) {
        if (!navigator.onLine) {
          setError(
            'You are offline. This action requires a network connection. ' +
              'It has been saved locally and will sync when you reconnect.',
          )
        } else {
          setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
        }
      }
    })
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader title="Record Expense" backHref="/expenses" />

      {/* Cashier info */}
      {userRole === 'cashier' && (
        <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-800">
          <AlertDescription>
            This expense will be submitted for approval by a manager or owner.
          </AlertDescription>
        </Alert>
      )}

      {/* Success message */}
      {success && (
        <Alert className="mb-4 border-green-200 bg-green-50 text-green-800">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Error banner */}
      <ErrorMessage message={error} className="mb-4" />

      <div className="space-y-4">
        {/* Date */}
        <div className="space-y-1.5">
          <Label>Expense Date</Label>
          <Input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="h-10"
            aria-invalid={!!fieldErrors.expenseDate}
          />
          {fieldErrors.expenseDate && (
            <p className="text-sm text-destructive">{fieldErrors.expenseDate}</p>
          )}
        </div>

        {/* Category grid */}
        <div className="space-y-1.5">
          <Label>Category</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {EXPENSE_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  category === cat.key
                    ? 'border-primary bg-primary/5 ring-2 ring-ring/50'
                    : 'border-input bg-card hover:border-muted-foreground/30'
                }`}
              >
                <p className="text-sm font-medium text-foreground">{cat.label}</p>
              </button>
            ))}
          </div>
          {fieldErrors.category && (
            <p className="text-sm text-destructive">{fieldErrors.category}</p>
          )}
        </div>

        {/* Capital asset info */}
        {isCapital && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">
              Asset purchases are recorded as Fixed Assets on your Balance Sheet, not as expenses.
              This affects your Profit & Loss report.
            </p>
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={capitalAcknowledged}
                onChange={(e) => setCapitalAcknowledged(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-amber-700">I understand</span>
            </label>
          </div>
        )}

        {/* Amount */}
        <MoneyInput
          label="Amount"
          currency="GHS"
          value={amount}
          onChange={setAmount}
          placeholder="0.00"
          error={fieldErrors.amount}
        />

        {/* VAT toggle */}
        {vatRegistered && !isCapital && (
          <div className="rounded-lg border border-input bg-card p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">This purchase includes VAT</p>
                <p className="text-xs text-muted-foreground">Reverse-calculate input VAT</p>
              </div>
              <Switch checked={includesVat} onCheckedChange={setIncludesVat} />
            </div>

            {/* VAT breakdown */}
            {includesVat && vatPreview && amountNum > 0 && (
              <div className="mt-3 flex gap-4 rounded-lg bg-muted p-2 text-xs text-muted-foreground">
                <span>Net: {formatGhs(vatPreview.netAmount)}</span>
                <span>VAT: {formatGhs(vatPreview.vatAmount)}</span>
                <span>Total: {formatGhs(amountNum)}</span>
              </div>
            )}
          </div>
        )}

        {/* Payment method */}
        <div className="space-y-1.5">
          <Label>Payment Method</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPaymentMethod(opt.value)}
                className={`rounded-xl border p-3 text-center transition-colors ${
                  paymentMethod === opt.value
                    ? 'border-primary bg-primary/5 ring-2 ring-ring/50'
                    : 'border-input bg-card hover:border-muted-foreground/30'
                }`}
              >
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
              </button>
            ))}
          </div>
          {fieldErrors.paymentMethod && (
            <p className="text-sm text-destructive">{fieldErrors.paymentMethod}</p>
          )}
        </div>

        {/* MoMo reference */}
        {paymentMethod.startsWith('momo_') && (
          <div className="space-y-1.5">
            <Label>
              MoMo Reference <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              value={momoReference}
              onChange={(e) => setMomoReference(e.target.value)}
              placeholder="Transaction reference"
              className="h-10"
              aria-invalid={!!fieldErrors.momoReference}
            />
            {fieldErrors.momoReference && (
              <p className="text-sm text-destructive">{fieldErrors.momoReference}</p>
            )}
          </div>
        )}

        {/* Bank reference */}
        {paymentMethod === 'bank' && (
          <div className="space-y-1.5">
            <Label>
              Bank Reference <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
              placeholder="Transfer reference"
              className="h-10"
              aria-invalid={!!fieldErrors.bankReference}
            />
            {fieldErrors.bankReference && (
              <p className="text-sm text-destructive">{fieldErrors.bankReference}</p>
            )}
          </div>
        )}

        {/* Description */}
        <div className="space-y-1.5">
          <Label>
            Description <span className="text-destructive">*</span>
          </Label>
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Fuel for delivery van, September rent"
            className="h-10"
            aria-invalid={!!fieldErrors.description}
          />
          {fieldErrors.description && (
            <p className="text-sm text-destructive">{fieldErrors.description}</p>
          )}
        </div>

        {/* Receipt capture */}
        <div className="space-y-1.5">
          <Label>Receipt (optional)</Label>
          {receiptPreview ? (
            <div className="mt-2 flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptPreview}
                alt="Receipt preview"
                className="h-[100px] w-[120px] rounded-lg border border-input object-cover"
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setReceiptPreview(null)
                  setReceiptFile(null)
                }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex gap-3">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm font-medium text-gray-500 transition-colors hover:border-green-400 hover:text-green-700">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                  />
                </svg>
                Take Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    e.target.value = ''
                    setReceiptFile(file)
                    setReceiptPreview(URL.createObjectURL(file))
                  }}
                />
              </label>
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                  />
                </svg>
                Gallery
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    e.target.value = ''
                    setReceiptFile(file)
                    setReceiptPreview(URL.createObjectURL(file))
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes"
          />
        </div>

        {/* Recurring expense toggle */}
        {!isCapital && (
          <div className="rounded-lg border border-input bg-card p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Recurring expense?</p>
                <p className="text-xs text-muted-foreground">Auto-posts on schedule</p>
              </div>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>

            {isRecurring && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  {(['monthly', 'weekly', 'quarterly'] as const).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setRecurrenceFrequency(freq)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        recurrenceFrequency === freq
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-input bg-card text-muted-foreground hover:border-muted-foreground/30'
                      }`}
                    >
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  BizSense will automatically re-post this expense every{' '}
                  {recurrenceFrequency === 'monthly'
                    ? 'month'
                    : recurrenceFrequency === 'weekly'
                      ? 'week'
                      : 'quarter'}
                  . You can stop it anytime by editing the expense and turning off recurrence.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <Button
          size="lg"
          className="w-full min-h-[44px] py-3 text-base"
          onClick={handleSubmit}
          disabled={isPending || !canSubmit}
        >
          {isPending
            ? 'Saving...'
            : userRole === 'cashier'
              ? 'Submit for Approval'
              : 'Record Expense'}
        </Button>
      </div>
    </>
  )
}
