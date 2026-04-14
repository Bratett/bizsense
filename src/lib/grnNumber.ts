import { localDb } from '@/db/local/dexie'
import { getDevicePrefix } from './device'

const GRN_NUMBER_PATTERN = /^GRN-[A-Z2-9]{4}-\d{4,}$/

export function isValidGrnNumber(n: string): boolean {
  return GRN_NUMBER_PATTERN.test(n)
}

export async function generateGrnNumber(): Promise<string> {
  const prefix = getDevicePrefix()

  const row = await localDb.meta.get('grnSeq')
  const nextSeq = ((row?.value as number) ?? 0) + 1
  await localDb.meta.put({ key: 'grnSeq', value: nextSeq })

  return `GRN-${prefix}-${String(nextSeq).padStart(4, '0')}`
}
