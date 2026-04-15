export default function Loading() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 h-8 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mb-4 h-10 w-full animate-pulse rounded-lg bg-gray-200" />
        <ul className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <li key={i} className="h-20 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </ul>
      </div>
    </main>
  )
}
