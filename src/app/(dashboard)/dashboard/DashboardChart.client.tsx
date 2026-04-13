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
import { formatGhs } from '@/lib/format'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function DashboardChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <Card>
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-sm font-semibold text-gray-900">
          Revenue vs Expenses (7 days)
        </CardTitle>
      </CardHeader>
      <CardContent>
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
                  formatGhs(Number(value)),
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
      </CardContent>
    </Card>
  )
}
