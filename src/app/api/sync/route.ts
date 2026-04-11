import { NextResponse } from 'next/server'

// Offline sync endpoints — implemented in Sprint 9
export async function GET() {
  return NextResponse.json({ message: 'Sync pull endpoint — Sprint 9' }, { status: 501 })
}

export async function POST() {
  return NextResponse.json({ message: 'Sync push endpoint — Sprint 9' }, { status: 501 })
}
