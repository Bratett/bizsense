'use client'

import { useState, useTransition } from 'react'
import { backfillCogs, type BackfillResult } from '@/actions/migrations/backfillCogs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'

export default function BackfillView() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<BackfillResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRun = () => {
    setError(null)
    setResult(null)

    startTransition(async () => {
      try {
        const res = await backfillCogs()
        setResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    })
  }

  return (
    <div>
      <PageHeader title="COGS Backfill" backHref="/inventory" />

      {/* Explanation */}
      <Alert className="mb-3 border-blue-200 bg-blue-50">
        <AlertDescription>
          <h2 className="text-sm font-semibold text-blue-900">What does this do?</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-blue-800">
            <li>Scans all past sales orders that have product-linked line items.</li>
            <li>
              For each order, computes the Cost of Goods Sold (COGS) using FIFO costing and adds the
              missing journal entry lines.
            </li>
            <li>
              This corrects the ledger so that your Profit &amp; Loss report reflects the true cost
              of goods sold.
            </li>
            <li>
              Running this multiple times is safe -- orders that have already been backfilled are
              skipped automatically.
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <Alert className="mb-3 border-amber-200 bg-amber-50">
        <AlertDescription className="text-sm text-amber-800">
          Before running, make sure you have set opening stock for all products that were sold in
          past orders. Products without opening stock will be reported as errors.
        </AlertDescription>
      </Alert>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Run Button */}
      {!result && (
        <Button onClick={handleRun} disabled={isPending} className="mt-4 w-full">
          {isPending ? 'Running Backfill...' : 'Run COGS Backfill'}
        </Button>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Backfill Complete</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Orders Processed</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-green-700">
                    {result.processed}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Orders Skipped</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-muted-foreground">
                    {result.skipped}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {result.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <h3 className="text-sm font-semibold">Errors ({result.errors.length})</h3>
                <div className="mt-2 space-y-2">
                  {result.errors.map((err, i) => (
                    <div key={i} className="text-sm">
                      {err.orderNumber ? (
                        <span>
                          Order <span className="font-mono font-medium">{err.orderNumber}</span>
                          {' -- '}
                        </span>
                      ) : null}
                      {err.reason}
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Button variant="outline" onClick={handleRun} disabled={isPending} className="w-full">
            {isPending ? 'Running...' : 'Run Again'}
          </Button>
        </div>
      )}
    </div>
  )
}
