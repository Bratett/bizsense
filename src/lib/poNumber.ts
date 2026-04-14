import { localDb } from '@/db/local/dexie'
import { getDevicePrefix } from './device'

const PO_NUMBER_PATTERN = /^PO-[A-Z2-9]{4}-\d{4,}$/

export function isValidPoNumber(n: string): boolean {
  return PO_NUMBER_PATTERN.test(n)
}

export async function generatePoNumber(): Promise<string> {
  const prefix = getDevicePrefix()

  const row = await localDb.meta.get('poSeq')
  const nextSeq = ((row?.value as number) ?? 0) + 1
  await localDb.meta.put({ key: 'poSeq', value: nextSeq })

  return `PO-${prefix}-${String(nextSeq).padStart(4, '0')}`
}
