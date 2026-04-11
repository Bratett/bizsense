import { NextResponse } from 'next/server'

// AI assistant proxy — implemented in Sprint 8
export async function POST() {
  return NextResponse.json({ message: 'AI chat endpoint — Sprint 8' }, { status: 501 })
}
