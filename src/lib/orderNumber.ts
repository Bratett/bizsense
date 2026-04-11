import { localDb } from './localDb'
import { getDevicePrefix } from './device'

const ORDER_NUMBER_PATTERN = /^ORD-[A-Z2-9]{4}-\d{4,}$/

export function isValidOrderNumber(n: string): boolean {
  return ORDER_NUMBER_PATTERN.test(n)
}

export async function generateOrderNumber(): Promise<string> {
  const prefix = getDevicePrefix()

  const row = await localDb.meta.get('orderSeq')
  const nextSeq = ((row?.value as number) ?? 0) + 1
  await localDb.meta.put({ key: 'orderSeq', value: nextSeq })

  return `ORD-${prefix}-${String(nextSeq).padStart(4, '0')}`
}
