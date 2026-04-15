'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { LogOut, KeyRound } from 'lucide-react'
import { changePassword, type SettingsActionResult } from '@/actions/settings'
import { signOut } from '@/actions/auth'
import { localDb } from '@/db/local/dexie'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const initialState: SettingsActionResult = { success: false, error: '' }

interface Props {
  view: 'password' | 'signout'
}

export default function AccountSection({ view }: Props) {
  return view === 'password' ? <ChangePasswordPanel /> : <SignOutPanel />
}

// ─── Change Password ──────────────────────────────────────────────────────────

function ChangePasswordPanel() {
  const [state, formAction, isPending] = useActionState(changePassword, initialState)
  const fieldErrors = !state.success ? state.fieldErrors : undefined

  useEffect(() => {
    if (state.success) {
      toast.success('Password updated successfully')
    }
  }, [state.success])

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
          <KeyRound className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
          <p className="text-sm text-gray-500">
            Update your account password. Use at least 8 characters.
          </p>
        </div>
      </div>

      {!state.success && state.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {state.success && (
        <Alert className="mb-4">
          <AlertDescription>Password updated successfully.</AlertDescription>
        </Alert>
      )}

      <form action={formAction} noValidate className="max-w-sm space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">
            New Password <span className="text-destructive">*</span>
          </Label>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={isPending}
            className={cn('h-11 px-4', fieldErrors?.newPassword && 'border-destructive')}
            placeholder="At least 8 characters"
          />
          {fieldErrors?.newPassword && (
            <p className="text-xs text-destructive">{fieldErrors.newPassword}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">
            Confirm New Password <span className="text-destructive">*</span>
          </Label>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            disabled={isPending}
            className={cn('h-11 px-4', fieldErrors?.confirmPassword && 'border-destructive')}
            placeholder="Re-enter new password"
          />
          {fieldErrors?.confirmPassword && (
            <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <Button type="submit" disabled={isPending} className="h-11 w-full text-base font-semibold">
          {isPending ? 'Updating…' : 'Update Password'}
        </Button>
      </form>
    </div>
  )
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

function SignOutPanel() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    // Clear local Dexie data before sign-out to prevent data leakage on shared devices.
    // Clears transactional tables; meta and settings are non-sensitive.
    // TODO Sprint 9: Move to a shared clearLocalData() utility.
    try {
      await Promise.all([
        localDb.orders.clear(),
        localDb.orderLines.clear(),
        localDb.customers.clear(),
        localDb.expenses.clear(),
        localDb.products.clear(),
        localDb.inventoryTransactions.clear(),
        localDb.journalEntries.clear(),
        localDb.journalLines.clear(),
        localDb.suppliers.clear(),
        localDb.syncQueue.clear(),
      ])
    } catch {
      // If clear fails, proceed with sign-out anyway
    }
    await signOut()
  }

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
          <LogOut className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sign Out</h2>
          <p className="text-sm text-gray-500">
            Sign out of your BizSense account on this device. Any unsynced changes will be lost.
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="destructive"
        className="h-11 gap-2 text-base font-semibold"
        onClick={() => setConfirmOpen(true)}
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        title="Sign out of BizSense?"
        message="Any unsynced offline data will be lost. Make sure you're connected to the internet before signing out."
        confirmLabel="Sign Out"
        variant="destructive"
        loading={isSigningOut}
        onConfirm={handleSignOut}
      />
    </div>
  )
}
