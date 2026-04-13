import { Skeleton } from '@/components/ui/skeleton'

export default function ReportsLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-6 w-24" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
            >
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
