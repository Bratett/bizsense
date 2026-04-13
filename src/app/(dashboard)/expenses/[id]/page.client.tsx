'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  approveExpense,
  rejectExpense,
  reverseExpense,
  type ExpenseDetail,
} from '@/actions/expenses'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { getCategoryLabel } from '@/lib/expenses/categories'
import ReceiptCapture from '@/components/receipts/ReceiptCapture.client'
import type { UserRole } from '@/lib/session'
import { formatGhs, formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { PageHeader } from '@/components/ui/page-header'

const STATUS_BADGE_VARIANT: Record<string, 'approved' | 'pending' | 'rejected'> = {
  approved: 'approved',
  pending_approval: 'pending',
  rejected: 'rejected',
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending_approval: 'Pending Approval',
  rejected: 'Rejected',
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel',
  momo_airtel: 'AirtelTigo',
  bank: 'Bank',
}

export default function ExpenseDetailView({
  expense,
  userRole,
}: {
  expense: ExpenseDetail
  userRole: UserRole
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showReversalDialog, setShowReversalDialog] = useState(false)
  const [reversalReason, setReversalReason] = useState('')

  const canApprove =
    (userRole === 'owner' || userRole === 'manager') &&
    expense.approvalStatus === 'pending_approval'

  const canReverse =
    (userRole === 'owner' || userRole === 'manager') &&
    expense.approvalStatus === 'approved' &&
    expense.journalEntryId

  const handleApprove = () => {
    setError(null)
    startTransition(async () => {
      const result = await approveExpense(expense.id)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  const handleReject = () => {
    setError(null)
    startTransition(async () => {
      const result = await rejectExpense(expense.id)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  const handleReverse = () => {
    if (reversalReason.trim().length < 5) return
    setError(null)
    startTransition(async () => {
      const result = await reverseExpense(expense.id, reversalReason.trim())
      if (result.success) {
        setShowReversalDialog(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/expenses" />}>Expenses</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{expense.description || getCategoryLabel(expense.category ?? '') || 'Expense'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="Expense Detail"
        subtitle={getCategoryLabel(expense.category ?? '') ?? expense.category ?? 'Uncategorized'}
        backHref="/expenses"
      />

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {/* Main info card */}
        <Card>
          <CardContent>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-foreground">{formatGhs(expense.amount)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{expense.description}</p>
              </div>
              <StatusBadge
                variant={STATUS_BADGE_VARIANT[expense.approvalStatus] ?? 'draft'}
              >
                {STATUS_LABELS[expense.approvalStatus] ?? expense.approvalStatus}
              </StatusBadge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="font-medium text-foreground">{formatDate(expense.expenseDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payment Method</p>
                <p className="font-medium text-foreground">
                  {PAYMENT_LABELS[expense.paymentMethod] ?? expense.paymentMethod}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account</p>
                <p className="font-medium text-foreground">
                  {expense.accountCode} &mdash; {expense.accountName}
                </p>
              </div>
              {expense.isCapitalExpense && (
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant="secondary">Capital Asset</Badge>
                </div>
              )}
            </div>

            {expense.approvedBy && expense.approvedAt && (
              <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                Approved on{' '}
                {new Date(expense.approvedAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Receipt */}
        <Card>
          <CardContent>
            <p className="mb-2 text-sm font-medium text-foreground">Receipt</p>
            <ReceiptCapture
              expenseId={expense.id}
              existingReceiptPath={expense.receiptUrl}
              onUploadComplete={() => router.refresh()}
            />
          </CardContent>
        </Card>

        {/* Notes */}
        {expense.notes && (
          <Card>
            <CardContent>
              <p className="mb-1 text-sm font-medium text-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{expense.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Journal reference */}
        {expense.journalEntryId && (userRole === 'owner' || userRole === 'accountant') && (
          <Card>
            <CardContent>
              <p className="mb-1 text-sm font-medium text-foreground">Journal Entry</p>
              <p className="font-mono text-xs text-muted-foreground">
                EXP-{expense.id.slice(0, 8).toUpperCase()}
              </p>
              <Button variant="link" className="mt-1 px-0" render={<Link href="/ledger" />}>
                View in ledger
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {canApprove && (
          <div className="flex gap-3">
            <Button className="flex-1 py-3" onClick={handleApprove} disabled={isPending}>
              {isPending ? 'Processing...' : 'Approve'}
            </Button>
            <Button
              variant="destructive"
              className="flex-1 py-3"
              onClick={handleReject}
              disabled={isPending}
            >
              Reject
            </Button>
          </div>
        )}

        {canReverse && !showReversalDialog && (
          <Button
            variant="destructive"
            className="w-full py-3"
            onClick={() => setShowReversalDialog(true)}
          >
            Reverse Expense
          </Button>
        )}

        {/* Reversal dialog */}
        {showReversalDialog && (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">
                This will post a reversal journal entry. The original expense and entry will remain
                for audit purposes.
              </p>
              <div className="mt-3">
                <Label>
                  Reason for reversal <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="text"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Entered wrong amount, duplicate entry"
                  className="mt-1"
                />
                {reversalReason.trim().length > 0 && reversalReason.trim().length < 5 && (
                  <p className="mt-1 text-xs text-destructive">
                    Reason must be at least 5 characters
                  </p>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleReverse}
                  disabled={isPending || reversalReason.trim().length < 5}
                >
                  {isPending ? 'Reversing...' : 'Confirm Reversal'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReversalDialog(false)
                    setReversalReason('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  )
}
