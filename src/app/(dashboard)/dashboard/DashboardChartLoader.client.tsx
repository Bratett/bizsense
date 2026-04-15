'use client'

import dynamic from 'next/dynamic'
import type { ChartDataPoint } from '@/lib/dashboard/queries'

const DashboardChart = dynamic(() => import('./DashboardChart.client'), {
  ssr: false,
  loading: () => (
    <div className="h-64 animate-pulse rounded-xl bg-gray-100" aria-label="Loading chart" />
  ),
})

export default function DashboardChartLoader({ data }: { data: ChartDataPoint[] }) {
  return <DashboardChart data={data} />
}
