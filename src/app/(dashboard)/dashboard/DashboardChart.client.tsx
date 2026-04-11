'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ChartDataPoint } from '@/lib/dashboard/queries'

function formatGHS(value: number): string {
  return `GHS ${value.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function DashboardChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Revenue vs Expenses (7 days)</h2>
      <div className="h-[160px] md:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
              width={50}
              tickFormatter={(v) => (v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`)}
              className="hidden md:block"
            />
            <Tooltip
              formatter={(value, name) => [
                formatGHS(Number(value)),
                name === 'revenue' ? 'Revenue' : 'Expenses',
              ]}
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                fontSize: '13px',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value: string) => (value === 'revenue' ? 'Revenue' : 'Expenses')}
            />
            <Bar dataKey="revenue" fill="#00704A" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" fill="#D93025" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
