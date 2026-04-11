import Link from 'next/link'
import { getServerSession } from '@/lib/session'

export const metadata = { title: 'Access Denied | BizSense' }

export default async function AccessDeniedPage() {
  await getServerSession()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        <div className="rounded-xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          <h1 className="text-xl font-semibold text-gray-900">Access Denied</h1>
          <p className="mt-2 text-sm text-gray-500">
            You don&apos;t have permission to view this report. Financial statements are restricted
            to owners, managers, and accountants.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-lg bg-green-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-800"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
