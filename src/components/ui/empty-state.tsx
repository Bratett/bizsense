'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  className?: string
}

export function EmptyState({ icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="mb-4 text-muted-foreground">{icon}</div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {subtitle && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{subtitle}</p>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Button render={<Link href={action.href} />}>{action.label}</Button>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </div>
      )}
    </div>
  )
}
