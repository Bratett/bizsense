import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Greeting */}
        <div>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>

        {/* Metric Cards 2x2 */}
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-32" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
            >
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>

        {/* Chart placeholder */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-3 h-[160px] md:h-[240px] w-full" />
        </div>

        {/* Activity Feed placeholder */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <Skeleton className="h-4 w-28" />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="mt-1.5 h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
