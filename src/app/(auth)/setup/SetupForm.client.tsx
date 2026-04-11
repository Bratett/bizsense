'use client'

import { useActionState } from 'react'
import { createBusiness } from '@/actions/auth'

const initialState = { error: '' }

export default function SetupForm() {
  const [state, formAction, isPending] = useActionState(createBusiness, initialState)

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-gray-700">
          Business name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="organization"
          autoFocus
          required
          disabled={isPending}
          maxLength={100}
          className="rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900
                     placeholder:text-gray-400 focus:border-green-600 focus:outline-none
                     focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="e.g. Ama's Trading Store"
        />
        <p className="text-xs text-gray-400">You can update this later in Settings.</p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-1 rounded-lg bg-green-700 px-4 py-3 text-base font-semibold
                   text-white transition-colors hover:bg-green-800 active:bg-green-900
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Creating your account…' : 'Create business'}
      </button>
    </form>
  )
}
