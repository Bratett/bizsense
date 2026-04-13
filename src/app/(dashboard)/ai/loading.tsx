import { Skeleton } from '@/components/ui/skeleton'

export default function AILoading() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <div className="border-b border-gray-200 bg-white p-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-1 h-3 w-48" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <Skeleton className={`h-16 rounded-2xl ${i % 2 === 0 ? 'w-48' : 'w-64'}`} />
          </div>
        ))}
      </div>
    </main>
  )
}
