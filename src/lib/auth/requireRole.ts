import { getServerSession, type UserRole } from '@/lib/session'

export async function requireRole(allowed: UserRole[]) {
  const session = await getServerSession()
  if (!allowed.includes(session.user.role)) {
    throw new Error('Forbidden: insufficient permissions')
  }
  return session.user
}
