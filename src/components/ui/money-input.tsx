'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface MoneyInputProps extends Omit<React.ComponentProps<'input'>, 'onChange'> {
  label?: string
  error?: string
  currency?: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function MoneyInput({
  label,
  error,
  currency = 'GHS',
  value,
  onChange,
  className,
  id,
  ...props
}: MoneyInputProps) {
  const generatedId = React.useId()
  const inputId = id || generatedId

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
          {currency}
        </span>
        <Input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-12 pl-14 text-right text-lg font-medium tabular-nums',
            error && 'border-destructive focus-visible:ring-destructive/20',
          )}
          aria-invalid={!!error}
          {...props}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
