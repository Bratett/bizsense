'use client'

import { useActionState } from 'react'
import { signUp, type SignUpState } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const initialState: SignUpState = { errors: {} }

export default function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUp, initialState)

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {/* General error banner */}
      {state.errors.general && (
        <Alert variant="destructive">
          <AlertDescription>{state.errors.general}</AlertDescription>
        </Alert>
      )}

      {/* Full Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          disabled={isPending}
          aria-invalid={!!state.errors.fullName}
          placeholder="Kwame Asante"
          className="h-11 px-4"
        />
        {state.errors.fullName && <p className="text-sm text-red-600">{state.errors.fullName}</p>}
      </div>

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
          aria-invalid={!!state.errors.email}
          placeholder="you@example.com"
          className="h-11 px-4"
        />
        {state.errors.email && <p className="text-sm text-red-600">{state.errors.email}</p>}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          aria-invalid={!!state.errors.password}
          placeholder="Min. 8 characters"
          className="h-11 px-4"
        />
        {state.errors.password && <p className="text-sm text-red-600">{state.errors.password}</p>}
      </div>

      {/* Business Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          name="businessName"
          type="text"
          autoComplete="organization"
          required
          disabled={isPending}
          maxLength={100}
          aria-invalid={!!state.errors.businessName}
          placeholder="e.g. Ama's Trading Store"
          className="h-11 px-4"
        />
        {state.errors.businessName && (
          <p className="text-sm text-red-600">{state.errors.businessName}</p>
        )}
      </div>

      {/* Phone (optional) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">
          Phone number
          <span className="ml-1 text-gray-400 font-normal">(optional)</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          disabled={isPending}
          aria-invalid={!!state.errors.phone}
          placeholder="0XX XXX XXXX"
          className="h-11 px-4"
        />
        {state.errors.phone ? (
          <p className="text-sm text-red-600">{state.errors.phone}</p>
        ) : (
          <p className="text-xs text-gray-400">For account recovery via SMS</p>
        )}
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isPending}
        size="lg"
        className="mt-1 h-11 text-base font-semibold"
      >
        {isPending ? 'Creating account\u2026' : 'Create Account'}
      </Button>
    </form>
  )
}
