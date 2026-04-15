'use client'

import { formatGhs } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import type { LowStockAlertData, OverdueAlertData } from '@/actions/alerts'

interface Props {
  lowStock: LowStockAlertData
  overdue: OverdueAlertData
}

const WA_LINK_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 active:bg-green-800 min-h-[44px]'

export default function AlertsClient({ lowStock, overdue }: Props) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Alerts & Notifications" />

      {/* ── No phone warning (shown if BOTH alerts are blocked by missing phone) */}
      {!lowStock.ownerPhone && !overdue.ownerPhone && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-800 text-sm">
            Add your phone number in{' '}
            <a href="/settings" className="font-medium underline">
              Settings → Business Profile
            </a>{' '}
            to send WhatsApp alerts to yourself.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Low Stock Alert ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">⚠️ Low Stock Alert</CardTitle>
          <p className="text-sm text-muted-foreground">
            Send a WhatsApp alert about low-stock products to yourself.
          </p>
        </CardHeader>
        <CardContent>
          {lowStock.productCount === 0 ? (
            <p className="text-sm text-green-700">
              ✓ All products are above their reorder levels. No alert needed.
            </p>
          ) : lowStock.canSend ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                {lowStock.productCount} product{lowStock.productCount !== 1 ? 's' : ''} below
                reorder level.
              </p>
              <a
                href={lowStock.whatsAppLink ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={WA_LINK_CLASS}
              >
                {/* WhatsApp icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Send Low Stock Alert ({lowStock.productCount} product
                {lowStock.productCount !== 1 ? 's' : ''})
              </a>
            </div>
          ) : (
            <p className="text-sm text-amber-700">⚠ {lowStock.reason}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Overdue Invoice Alert ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📋 Overdue Invoice Summary</CardTitle>
          <p className="text-sm text-muted-foreground">
            Send a WhatsApp summary of overdue invoices (&gt;30 days) to yourself.
          </p>
        </CardHeader>
        <CardContent>
          {overdue.invoiceCount === 0 ? (
            <p className="text-sm text-green-700">
              ✓ No invoices are more than 30 days overdue.
            </p>
          ) : overdue.canSend ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {overdue.invoiceCount} invoice{overdue.invoiceCount !== 1 ? 's' : ''} overdue
                </span>
                <span className="font-semibold text-red-700">
                  {formatGhs(overdue.totalOutstanding)}
                </span>
              </div>
              <a
                href={overdue.whatsAppLink ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={WA_LINK_CLASS}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Send Overdue Invoice Summary
              </a>
            </div>
          ) : (
            <p className="text-sm text-amber-700">⚠ {overdue.reason}</p>
          )}
        </CardContent>
      </Card>

      {/* ── MoMo Reconciliation link ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MoMo Reconciliation</CardTitle>
          <p className="text-sm text-muted-foreground">
            Compare your MoMo wallet balance to your books.
          </p>
        </CardHeader>
        <CardContent>
          <a href="/momo/reconcile" className="text-sm font-medium text-blue-600 hover:underline">
            Open MoMo Reconciliation →
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
