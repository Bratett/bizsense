import { notFound } from 'next/navigation'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/db'
import { userFeedback, users } from '@/db/schema'
import { getServerSession } from '@/lib/session'

export const metadata = { title: 'Feedback — Admin' }

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    bug: 'bg-red-50 text-red-700',
    suggestion: 'bg-blue-50 text-blue-700',
    confusion: 'bg-yellow-50 text-yellow-700',
  }
  const cls = styles[type] ?? 'bg-gray-50 text-gray-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {type}
    </span>
  )
}

export default async function AdminFeedbackPage() {
  const session = await getServerSession()

  // Developer-only route — owner role required
  if (session.user.role !== 'owner') notFound()

  const items = await db
    .select({
      id: userFeedback.id,
      type: userFeedback.type,
      message: userFeedback.message,
      route: userFeedback.route,
      createdAt: userFeedback.createdAt,
      fullName: users.fullName,
    })
    .from(userFeedback)
    .leftJoin(users, eq(userFeedback.userId, users.id))
    .where(eq(userFeedback.businessId, session.user.businessId))
    .orderBy(desc(userFeedback.createdAt))
    .limit(100)

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">Feedback</h1>
      <p className="mb-6 text-sm text-gray-500">
        {items.length} submission{items.length !== 1 ? 's' : ''} — newest first
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No feedback submitted yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500">Screen</th>
                <th className="px-4 py-3 font-medium text-gray-500">Message</th>
                <th className="px-4 py-3 font-medium text-gray-500">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="align-top bg-white">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {item.createdAt?.toLocaleDateString('en-GH', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={item.type} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.route ?? '—'}</td>
                  <td className="max-w-sm px-4 py-3 text-gray-900">{item.message}</td>
                  <td className="px-4 py-3 text-gray-500">{item.fullName ?? 'Unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
