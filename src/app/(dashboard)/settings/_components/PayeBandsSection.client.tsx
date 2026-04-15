'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, X, Check, Trash2, AlertTriangle } from 'lucide-react'
import { updatePayeBands, type PayeBandInput } from '@/actions/payroll'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { PayeBandRecord } from '../page.client'

// ─── Local band state (includes local-only rows not yet saved) ────────────────

interface BandRow {
  id: string | null // null = newly added (not yet persisted)
  lowerBound: string
  upperBound: string
  rate: string
  editing: boolean
  isNew: boolean
}

function recordsToRows(records: PayeBandRecord[]): BandRow[] {
  return records.map((r) => ({
    id: r.id,
    lowerBound: r.lowerBound,
    upperBound: r.upperBound ?? '',
    rate: (Number(r.rate) * 100).toFixed(4),
    editing: false,
    isNew: false,
  }))
}

interface Props {
  payeBands: PayeBandRecord[]
  userRole: string
}

export default function PayeBandsSection({ payeBands, userRole }: Props) {
  const canEdit = userRole === 'owner' || userRole === 'accountant'
  const [bands, setBands] = useState<BandRow[]>(() => recordsToRows(payeBands))
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  function startEditing(idx: number) {
    setBands((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, editing: true } : { ...b, editing: false })),
    )
  }

  function cancelEditing(idx: number) {
    setBands((prev) => {
      const b = prev[idx]!
      if (b.isNew) {
        // Remove the newly added row that was never saved
        return prev.filter((_, i) => i !== idx)
      }
      return prev.map((b2, i) => (i === idx ? { ...b2, editing: false } : b2))
    })
  }

  function updateField(idx: number, field: keyof BandRow, value: string) {
    setBands((prev) => prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b)))
  }

  function addBand() {
    setBands((prev) => [
      ...prev.map((b) => ({ ...b, editing: false })),
      {
        id: null,
        lowerBound: '',
        upperBound: '',
        rate: '0',
        editing: true,
        isNew: true,
      },
    ])
  }

  function removeBand(idx: number) {
    if (bands.length <= 1) {
      toast.error('At least one PAYE band is required')
      return
    }
    setBands((prev) => prev.filter((_, i) => i !== idx))
  }

  function confirmRowEdit(idx: number) {
    setBands((prev) => prev.map((b, i) => (i === idx ? { ...b, editing: false, isNew: false } : b)))
  }

  function handleSaveAll() {
    setSaveError(null)

    const inputs: PayeBandInput[] = []
    for (const b of bands) {
      const lower = parseFloat(b.lowerBound)
      const upper = b.upperBound.trim() === '' ? null : parseFloat(b.upperBound)
      const rate = parseFloat(b.rate)

      if (isNaN(lower) || lower < 0) {
        setSaveError('All lower bound values must be valid non-negative numbers')
        return
      }
      if (upper !== null && isNaN(upper)) {
        setSaveError('Upper bound must be a valid number or empty (for no ceiling)')
        return
      }
      if (isNaN(rate) || rate < 0 || rate > 100) {
        setSaveError('All rates must be between 0 and 100')
        return
      }

      inputs.push({ lowerBound: lower, upperBound: upper, rate })
    }

    startTransition(async () => {
      try {
        await updatePayeBands(inputs)
        toast.success('PAYE bands updated — effective from today')
        // Reflect confirmed state (no more new/editing rows)
        setBands((prev) => prev.map((b) => ({ ...b, editing: false, isNew: false })))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save PAYE bands'
        setSaveError(msg)
        toast.error(msg)
      }
    })
  }

  function formatRate(rateStr: string) {
    const n = parseFloat(rateStr)
    return isNaN(n) ? rateStr : `${n.toFixed(2)}%`
  }

  function formatBound(val: string) {
    if (!val || val.trim() === '') return '∞'
    const n = parseFloat(val)
    return isNaN(n) ? val : `GHS ${n.toLocaleString()}`
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">PAYE Tax Bands</h2>
          <p className="mt-1 text-sm text-gray-500">
            GRA PAYE schedule. Update when GRA revises the tax bands.
          </p>
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={addBand} disabled={isPending}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Band
          </Button>
        )}
      </div>

      {/* Warning */}
      <Alert className="mb-4 border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 text-sm">
          Changes to PAYE bands affect all future payroll runs but do not retroactively change
          approved payroll runs. Verify with a qualified tax professional before updating.{' '}
          <a
            href="https://gra.gov.gh"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Source: GRA (gra.gov.gh)
          </a>
        </AlertDescription>
      </Alert>

      {saveError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {/* Bands table */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>From (GHS/yr)</TableHead>
              <TableHead>To (GHS/yr)</TableHead>
              <TableHead className="w-28 text-right">Rate (%)</TableHead>
              {canEdit && <TableHead className="w-24 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bands.map((band, idx) => (
              <TableRow key={idx}>
                {/* Lower bound */}
                <TableCell>
                  {band.editing ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      value={band.lowerBound}
                      onChange={(e) => updateField(idx, 'lowerBound', e.target.value)}
                      className="h-8 w-32 text-sm"
                      disabled={isPending}
                    />
                  ) : (
                    <span className="font-mono text-sm">{formatBound(band.lowerBound)}</span>
                  )}
                </TableCell>

                {/* Upper bound */}
                <TableCell>
                  {band.editing ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      value={band.upperBound}
                      onChange={(e) => updateField(idx, 'upperBound', e.target.value)}
                      placeholder="No ceiling"
                      className="h-8 w-32 text-sm"
                      disabled={isPending}
                    />
                  ) : (
                    <span className="font-mono text-sm">{formatBound(band.upperBound)}</span>
                  )}
                </TableCell>

                {/* Rate */}
                <TableCell className="text-right">
                  {band.editing ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      value={band.rate}
                      onChange={(e) => updateField(idx, 'rate', e.target.value)}
                      className="h-8 w-24 text-sm text-right ml-auto"
                      disabled={isPending}
                    />
                  ) : (
                    <span className="font-mono text-sm">{formatRate(band.rate)}</span>
                  )}
                </TableCell>

                {/* Actions */}
                {canEdit && (
                  <TableCell className="text-right">
                    {band.editing ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="default"
                          className="min-h-[44px] min-w-[44px]"
                          onClick={() => confirmRowEdit(idx)}
                          disabled={isPending}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="min-h-[44px] min-w-[44px]"
                          onClick={() => cancelEditing(idx)}
                          disabled={isPending}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="min-h-[44px] min-w-[44px]"
                          onClick={() => startEditing(idx)}
                          disabled={isPending}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {bands.length > 1 && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="min-h-[44px] min-w-[44px] text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => removeBand(idx)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}

            {bands.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 4 : 3}
                  className="py-8 text-center text-sm text-gray-600"
                >
                  No PAYE bands configured
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {canEdit && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Saving will expire current bands and create new ones effective today.
          </p>
          <Button onClick={handleSaveAll} disabled={isPending} className="min-h-[44px]">
            {isPending ? 'Saving…' : 'Save All Changes'}
          </Button>
        </div>
      )}

      {!canEdit && (
        <p className="mt-3 text-xs text-gray-600">
          Only the owner or accountant can edit PAYE bands.
        </p>
      )}
    </div>
  )
}
