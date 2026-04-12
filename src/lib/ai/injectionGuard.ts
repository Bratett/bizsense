const INJECTION_PATTERNS = [
  /ignore\s+(previous|prior|all)\s+instructions?/i,
  /override\s+(system|prompt|instructions?)/i,
  /forget\s+(everything|all|your|the)\s+(instructions?|rules?|constraints?)/i,
  /you\s+are\s+now\s+/i,
  /act\s+as\s+if\s+/i,
  /reveal\s+(your\s+)?(system\s+prompt|instructions?|api\s+key)/i,
  /business[_\s]?id\s*[:=]\s*[a-f0-9-]{36}/i, // explicit business_id injection
  /other\s+business/i,
  /different\s+business/i,
  /all\s+businesses/i,
]

export function checkInjectionPatterns(message: string): {
  suspicious: boolean
  matchedPatterns: string[]
} {
  const matched = INJECTION_PATTERNS.filter((p) => p.test(message))
  return {
    suspicious: matched.length > 0,
    matchedPatterns: matched.map((p) => p.source),
  }
}
