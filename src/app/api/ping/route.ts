import { NextResponse } from 'next/server'

// Lightweight connectivity probe used by isNetworkAvailable() in src/lib/network.ts.
// Returns 200 with no body — a HEAD request is sufficient.
export function HEAD() {
  return new NextResponse(null, { status: 200 })
}

export function GET() {
  return new NextResponse(null, { status: 200 })
}
