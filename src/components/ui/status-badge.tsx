'use client'

import { cn } from '@/lib/utils'

const STATUS_VARIANTS = {
  paid: 'bg-[var(--badge-paid-bg)] text-[var(--badge-paid-text)]',
  pending: 'bg-[var(--badge-pending-bg)] text-[var(--badge-pending-text)]',
  overdue: 'bg-[var(--badge-overdue-bg)] text-[var(--badge-overdue-text)]',
  draft: 'bg-[var(--badge-draft-bg)] text-[var(--badge-draft-text)]',
  ai: 'bg-[var(--badge-ai-bg)] text-[var(--badge-ai-text)]',
  reversal: 'bg-[var(--badge-reversal-bg)] text-[var(--badge-reversal-text)]',
  partial: 'bg-[var(--badge-pending-bg)] text-[var(--badge-pending-text)]',
  approved: 'bg-[var(--badge-paid-bg)] text-[var(--badge-paid-text)]',
  rejected: 'bg-[var(--badge-overdue-bg)] text-[var(--badge-overdue-text)]',
  cancelled: 'bg-[var(--badge-draft-bg)] text-[var(--badge-draft-text)]',
  unpaid: 'bg-[var(--badge-overdue-bg)] text-[var(--badge-overdue-text)]',
  received: 'bg-[var(--badge-paid-bg)] text-[var(--badge-paid-text)]',
  sent: 'bg-[var(--badge-pending-bg)] text-[var(--badge-pending-text)]',
} as const

type StatusVariant = keyof typeof STATUS_VARIANTS

interface StatusBadgeProps {
  variant: StatusVariant
  children: React.ReactNode
  className?: string
}

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
