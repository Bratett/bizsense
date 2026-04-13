'use client'

import { useActionState } from 'react'
import { signIn } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const initialState = { error: '' }

export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState)

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {/* Error banner */}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          disabled={isPending}
          placeholder="you@example.com"
          className="h-11 px-4"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <span className="text-xs text-gray-400 cursor-default" title="Coming soon">
            Forgot password?
          </span>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          placeholder="&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;"
          className="h-11 px-4"
        />
      </div>

      {/* Submit */}
      <Button type="submit" disabled={isPending} size="lg" className="mt-1 h-11 text-base font-semibold">
        {isPending ? 'Signing in\u2026' : 'Sign in'}
      </Button>
    </form>
  )
}
