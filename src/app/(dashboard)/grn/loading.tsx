import { Skeleton } from '@/components/ui/skeleton'

export default function GRNLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
            >
              <div>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3 w-36" />
              </div>
              <div className="text-right">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-1 h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
