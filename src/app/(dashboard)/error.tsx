'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <div className="text-4xl mb-4">😕</div>
      <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
      <p className="text-gray-600 mb-6 text-sm max-w-sm">
        An unexpected error occurred. Your data is safe.
        {error.message && ` (${error.message})`}
      </p>
      <button
        onClick={reset}
        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium min-h-[44px]"
      >
        Try Again
      </button>
    </div>
  )
}
