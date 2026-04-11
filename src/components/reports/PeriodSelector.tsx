'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import type { PeriodParams } from '@/lib/reports/periods'
import {
  currentMonthPeriod,
  priorMonthPeriod,
  yearToDatePeriod,
  quarterPeriod,
} from '@/lib/reports/periods'

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  value: PeriodParams
  onChange?: (period: PeriodParams) => void
  mode?: 'range' | 'asOf' | 'both'
}

type Preset = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'ytd' | 'custom'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActivePreset(value: PeriodParams): Preset {
  if (value.type === 'asOf') return 'custom'
  const cm = currentMonthPeriod()
  const pm = priorMonthPeriod()
  if (cm.type === 'range' && value.from === cm.from && value.to === cm.to) return 'this_month'
  if (pm.type === 'range' && value.from === pm.from && value.to === pm.to) return 'last_month'
  return 'custom'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PeriodSelector({ value, onChange, mode = 'range' }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [showCustom, setShowCustom] = useState(getActivePreset(value) === 'custom')
  // 'both' mode state — hoisted here to satisfy rules-of-hooks (no hooks after early returns)
  const [periodType, setPeriodType] = useState<'range' | 'asOf'>(
    value.type === 'asOf' ? 'asOf' : 'range',
  )

  // Build URL preserving existing query params, then push
  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, val] of Object.entries(overrides)) {
        if (val === undefined) {
          params.delete(key)
        } else {
          params.set(key, val)
        }
      }
      return `?${params.toString()}`
    },
    [searchParams],
  )

  const navigate = (period: PeriodParams) => {
    let overrides: Record<string, string | undefined>
    if (period.type === 'range') {
      overrides = { dateFrom: period.from, dateTo: period.to, date: undefined }
    } else {
      overrides = { date: period.date, dateFrom: undefined, dateTo: undefined }
    }
    startTransition(() => router.push(buildUrl(overrides)))
    onChange?.(period)
  }

  const applyPreset = (preset: Preset) => {
    if (preset === 'custom') {
      setShowCustom(true)
      return
    }
    setShowCustom(false)

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentQuarter = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4
    const prevQuarter = (currentQuarter === 1 ? 4 : currentQuarter - 1) as 1 | 2 | 3 | 4
    const prevQuarterYear = currentQuarter === 1 ? currentYear - 1 : currentYear

    const periods: Record<Exclude<Preset, 'custom'>, PeriodParams> = {
      this_month: currentMonthPeriod(),
      last_month: priorMonthPeriod(),
      this_quarter: quarterPeriod(currentYear, currentQuarter),
      last_quarter: quarterPeriod(prevQuarterYear, prevQuarter),
      ytd: yearToDatePeriod(1),
    }

    navigate(periods[preset as Exclude<Preset, 'custom'>])
  }

  const activePreset = getActivePreset(value)

  const btnBase = 'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors'
  const btnActive = `${btnBase} bg-green-700 text-white border-green-700`
  const btnInactive = `${btnBase} bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:text-green-700`

  // ── Render: range mode ─────────────────────────────────────────────────────

  if (mode === 'range') {
    const rangeValue = value.type === 'range' ? value : { from: '', to: '' }

    return (
      <div className={`flex flex-wrap items-center gap-2 ${isPending ? 'opacity-60' : ''}`}>
        {(
          ['this_month', 'last_month', 'this_quarter', 'last_quarter', 'ytd', 'custom'] as Preset[]
        ).map((preset) => {
          const labels: Record<Preset, string> = {
            this_month: 'This Month',
            last_month: 'Last Month',
            this_quarter: 'This Quarter',
            last_quarter: 'Last Quarter',
            ytd: 'Year to Date',
            custom: 'Custom',
          }
          const isActive = preset === 'custom' ? showCustom : activePreset === preset
          return (
            <button
              key={preset}
              onClick={() => applyPreset(preset)}
              className={isActive ? btnActive : btnInactive}
            >
              {labels[preset]}
            </button>
          )
        })}

        {showCustom && (
          <div className="flex items-center gap-2 mt-1 w-full sm:w-auto sm:mt-0">
            <input
              type="date"
              value={rangeValue.from}
              onChange={(e) => {
                if (e.target.value && rangeValue.to) {
                  navigate({ type: 'range', from: e.target.value, to: rangeValue.to })
                }
              }}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-36 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={rangeValue.to}
              onChange={(e) => {
                if (e.target.value && rangeValue.from) {
                  navigate({ type: 'range', from: rangeValue.from, to: e.target.value })
                }
              }}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-36 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
            />
          </div>
        )}

        {isPending && <span className="text-xs text-gray-400 ml-1">Loading…</span>}
      </div>
    )
  }

  // ── Render: asOf mode ──────────────────────────────────────────────────────

  if (mode === 'asOf') {
    const asOfValue = value.type === 'asOf' ? value.date : new Date().toISOString().slice(0, 10)

    return (
      <div className={`flex items-center gap-3 ${isPending ? 'opacity-60' : ''}`}>
        <label className="text-sm text-gray-600 font-medium">As at date</label>
        <input
          type="date"
          value={asOfValue}
          onChange={(e) => {
            if (e.target.value) {
              navigate({ type: 'asOf', date: e.target.value })
            }
          }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-40 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
        />
        {isPending && <span className="text-xs text-gray-400">Loading…</span>}
      </div>
    )
  }

  // ── Render: both mode ──────────────────────────────────────────────────────

  const rangeValue = value.type === 'range' ? value : { from: '', to: '' }
  const asOfValue = value.type === 'asOf' ? value.date : new Date().toISOString().slice(0, 10)

  return (
    <div className={`flex flex-wrap items-center gap-3 ${isPending ? 'opacity-60' : ''}`}>
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        <button
          onClick={() => setPeriodType('range')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            periodType === 'range'
              ? 'bg-green-700 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Period
        </button>
        <button
          onClick={() => setPeriodType('asOf')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
            periodType === 'asOf'
              ? 'bg-green-700 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          As at date
        </button>
      </div>

      {periodType === 'range' ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={rangeValue.from}
            onChange={(e) => {
              if (e.target.value && rangeValue.to) {
                navigate({ type: 'range', from: e.target.value, to: rangeValue.to })
              }
            }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-36 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={rangeValue.to}
            onChange={(e) => {
              if (e.target.value && rangeValue.from) {
                navigate({ type: 'range', from: rangeValue.from, to: e.target.value })
              }
            }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-36 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
          />
        </div>
      ) : (
        <input
          type="date"
          value={asOfValue}
          onChange={(e) => {
            if (e.target.value) navigate({ type: 'asOf', date: e.target.value })
          }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-40 focus:border-green-600 focus:ring-2 focus:ring-green-100 focus:outline-none"
        />
      )}

      {isPending && <span className="text-xs text-gray-400">Loading…</span>}
    </div>
  )
}
