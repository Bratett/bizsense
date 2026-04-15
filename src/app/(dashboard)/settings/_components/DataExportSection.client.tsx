'use client'

import { useState } from 'react'
import { Download, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb } from '@/db/local/dexie'
import { bootstrapLocalData } from '@/lib/offline/bootstrap'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  businessId: string
  showSyncStatus: boolean
}

function formatDate(isoString: string | undefined | null) {
  if (!isoString) return 'Never'
  return new Date(isoString).toLocaleString('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Sync Status panel ────────────────────────────────────────────────────────

function SyncStatusPanel({ businessId }: { businessId: string }) {
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const lastPull = useLiveQuery(() => localDb.meta.get('lastPullAt'))
  const pendingCount = useLiveQuery(() =>
    localDb.syncQueue.where('status').equals('pending').count(),
  )
  const failedCount = useLiveQuery(() => localDb.syncQueue.where('status').equals('failed').count())

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    try {
      await bootstrapLocalData(businessId)
    } catch {
      setSyncError('Sync failed. Check your connection and try again.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sync Status</CardTitle>
        <CardDescription>
          BizSense works fully offline. Data syncs automatically when you&apos;re connected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium text-gray-500">Last Synced</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {formatDate(lastPull?.value as string)}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium text-gray-500">Pending Changes</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">{pendingCount ?? 0}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium text-gray-500">Failed</p>
            <p
              className={`mt-0.5 text-sm font-semibold ${(failedCount ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}
            >
              {failedCount ?? 0}
            </p>
          </div>
        </div>

        {syncError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {syncError}
          </div>
        )}

        {!syncing && !syncError && lastPull && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4" />
            Local data is up to date
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={handleSync}
          disabled={syncing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Export panel ─────────────────────────────────────────────────────────────

function ExportPanel({ businessId }: { businessId: string }) {
  const [exporting, setExporting] = useState<string | null>(null)

  async function exportCustomers() {
    setExporting('customers')
    try {
      const rows = await localDb.customers
        .where('businessId')
        .equals(businessId)
        .filter((c) => c.isActive)
        .toArray()
      const headers = [
        'ID',
        'Name',
        'Phone',
        'Email',
        'Location',
        'Credit Limit (GHS)',
        'Payment Terms (days)',
      ]
      const data = rows.map((c) => [
        c.id,
        c.name,
        c.phone ?? '',
        c.email ?? '',
        c.location ?? '',
        String(c.creditLimit ?? 0),
        String(c.paymentTermsDays ?? 0),
      ])
      downloadCsv('customers.csv', [headers, ...data])
    } finally {
      setExporting(null)
    }
  }

  async function exportProducts() {
    setExporting('products')
    try {
      const rows = await localDb.products
        .where('businessId')
        .equals(businessId)
        .filter((p) => p.isActive)
        .toArray()
      const headers = [
        'ID',
        'SKU',
        'Name',
        'Category',
        'Unit',
        'Cost Price (GHS)',
        'Selling Price (GHS)',
        'Selling Price (USD)',
        'Reorder Level',
      ]
      const data = rows.map((p) => [
        p.id,
        p.sku ?? '',
        p.name,
        p.category ?? '',
        p.unit ?? '',
        String(p.costPrice ?? 0),
        String(p.sellingPrice ?? 0),
        String(p.sellingPriceUsd ?? ''),
        String(p.reorderLevel ?? 0),
      ])
      downloadCsv('products.csv', [headers, ...data])
    } finally {
      setExporting(null)
    }
  }

  async function exportOrders() {
    setExporting('orders')
    try {
      const orders = await localDb.orders.where('businessId').equals(businessId).toArray()
      const customerIds = [...new Set(orders.map((o) => o.customerId).filter(Boolean))] as string[]
      const customers = await localDb.customers.where('id').anyOf(customerIds).toArray()
      const customerMap = new Map(customers.map((c) => [c.id, c.name]))

      const headers = [
        'Order No.',
        'Date',
        'Customer',
        'Total (GHS)',
        'Payment Status',
        'Amount Paid (GHS)',
      ]
      const data = orders.map((o) => [
        o.orderNumber ?? o.localOrderNumber ?? '',
        o.orderDate,
        customerMap.get(o.customerId ?? '') ?? 'Walk-in',
        String(o.totalAmount ?? 0),
        o.paymentStatus,
        String(o.amountPaid ?? 0),
      ])
      downloadCsv('orders.csv', [headers, ...data])
    } finally {
      setExporting(null)
    }
  }

  async function exportExpenses() {
    setExporting('expenses')
    try {
      const rows = await localDb.expenses.where('businessId').equals(businessId).toArray()
      const headers = [
        'ID',
        'Date',
        'Category',
        'Description',
        'Amount (GHS)',
        'Payment Method',
        'Status',
      ]
      const data = rows.map((e) => [
        e.id,
        e.expenseDate,
        e.category ?? '',
        e.description,
        String(e.amount ?? 0),
        e.paymentMethod ?? '',
        e.approvalStatus,
      ])
      downloadCsv('expenses.csv', [headers, ...data])
    } finally {
      setExporting(null)
    }
  }

  const exports = [
    {
      key: 'customers',
      label: 'Customers',
      description: 'All active customers with contact details and credit limits',
      fn: exportCustomers,
    },
    {
      key: 'products',
      label: 'Products',
      description: 'Product catalogue with pricing and reorder levels',
      fn: exportProducts,
    },
    {
      key: 'orders',
      label: 'Orders',
      description: 'Sales order history with payment status',
      fn: exportOrders,
    },
    {
      key: 'expenses',
      label: 'Expenses',
      description: 'Expense records with categories and amounts',
      fn: exportExpenses,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Export Data</CardTitle>
        <CardDescription>
          Download your business data as CSV files for use in spreadsheets or accounting software.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {exports.map(({ key, label, description, fn }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fn}
                disabled={exporting !== null}
                className="gap-1.5 shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting === key ? 'Exporting…' : 'Export'}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DataExportSection({ businessId, showSyncStatus }: Props) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">
        {showSyncStatus ? 'Sync Status' : 'Export Data'}
      </h2>
      <p className="mb-6 text-sm text-gray-500">
        {showSyncStatus
          ? 'Monitor the sync status between this device and the cloud.'
          : 'Download copies of your business data for backup or analysis.'}
      </p>

      <div className="space-y-4">
        {showSyncStatus && <SyncStatusPanel businessId={businessId} />}
        {!showSyncStatus && <ExportPanel businessId={businessId} />}
      </div>
    </div>
  )
}
