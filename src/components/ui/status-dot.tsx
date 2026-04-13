import { cn } from '@/lib/utils'

const DOT_COLORS = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
} as const

interface StatusDotProps {
  color: keyof typeof DOT_COLORS
  label?: string
  className?: string
}

export function StatusDot({ color, label, className }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT_COLORS[color])} />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </span>
  )
}
