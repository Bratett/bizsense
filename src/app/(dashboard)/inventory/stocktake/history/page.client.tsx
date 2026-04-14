'use client'

import { History } from 'lucide-react'
import type { StocktakeHistoryItem } from '@/actions/stocktakes'
import { formatGhs } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

function formatDateObj(date: Date): string {
  return new Date(date).toLocaleDateString('en-GH', { dateStyle: 'medium' })
}

const STATUS_VARIANT: Record<string, 'approved' | 'cancelled' | 'pending'> = {
  confirmed: 'approved',
  cancelled: 'cancelled',
  in_progress: 'pending',
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  in_progress: 'In Progress',
}

export default function StocktakeHistoryView({ history }: { history: StocktakeHistoryItem[] }) {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Stocktake History" backHref="/inventory/stocktake" />

      <div className="mt-4 space-y-2">
        {history.length === 0 ? (
          <EmptyState
            icon={<History className="h-10 w-10" />}
            title="No stocktakes yet"
            subtitle="Start your first stocktake from the stocktake page."
            action={{ label: 'Go to Stocktake', href: '/inventory/stocktake' }}
          />
        ) : (
          history.map((item) => {
            const variant = STATUS_VARIANT[item.status] ?? 'cancelled'
            return (
              <Card key={item.id}>
                <CardContent>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {formatDateObj(item.initiatedAt)}
                      </p>
                      {item.confirmedAt && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Confirmed {formatDateObj(item.confirmedAt)}
                        </p>
                      )}
                    </div>
                    <StatusBadge variant={variant}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>{item.lineCount} products</span>
                    {item.status === 'confirmed' && (
                      <span>Total variance: {formatGhs(item.totalVarianceValue)}</span>
                    )}
                  </div>
                  {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
