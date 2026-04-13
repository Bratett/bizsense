'use client'

import { useActionState } from 'react'
import { createBusiness } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const initialState = { error: '' }

export default function SetupForm() {
  const [state, formAction, isPending] = useActionState(createBusiness, initialState)

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Business name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="organization"
          autoFocus
          required
          disabled={isPending}
          maxLength={100}
          placeholder="e.g. Ama's Trading Store"
          className="h-11 px-4"
        />
        <p className="text-xs text-gray-400">You can update this later in Settings.</p>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        size="lg"
        className="mt-1 h-11 text-base font-semibold"
      >
        {isPending ? 'Creating your account\u2026' : 'Create business'}
      </Button>
    </form>
  )
}
