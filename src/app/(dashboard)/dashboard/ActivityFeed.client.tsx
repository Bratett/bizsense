'use client'

import { useRouter } from 'next/navigation'
import type { ActivityItem } from '@/lib/dashboard/queries'
import { formatGhs, formatDate, avatarColor } from '@/lib/format'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'

function getInitial(description: string): string {
  return (description[0] ?? '?').toUpperCase()
}

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <Card className="text-center">
        <CardContent className="py-6">
          <p className="text-sm font-semibold text-gray-900">Recent Activity</p>
          <p className="mt-2 text-sm text-gray-500">No recent activity yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-sm font-semibold text-gray-900">Recent Activity</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={`${item.type}-${item.id}`}>
            <button
              onClick={() => router.push(item.href)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
            >
              <Avatar size="lg">
                <AvatarFallback
                  className={cn('text-white text-xs font-semibold', avatarColor(item.description))}
                >
                  {getInitial(item.description)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{item.description}</p>
                <p className="text-xs text-gray-500">
                  {item.type === 'sale' ? 'Sale' : 'Expense'}
                  {' \u00b7 '}
                  {formatDate(item.date)}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    item.type === 'sale' ? 'text-green-700' : 'text-red-600',
                  )}
                >
                  {item.type === 'sale' ? '+' : '-'}
                  {formatGhs(item.amount)}
                </p>
                {item.status === 'pending_approval' && (
                  <StatusBadge variant="pending" className="mt-0.5 text-[10px]">
                    Pending
                  </StatusBadge>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
