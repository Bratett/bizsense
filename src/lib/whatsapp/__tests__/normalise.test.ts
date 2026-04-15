import { describe, it, expect } from 'vitest'
import { normaliseGhanaPhone } from '../normalise'

describe('normaliseGhanaPhone', () => {
  it('normalises 0-prefixed 10-digit number', () => {
    expect(normaliseGhanaPhone('0244123456')).toBe('233244123456')
  })

  it('strips + from E.164 format', () => {
    expect(normaliseGhanaPhone('+233244123456')).toBe('233244123456')
  })

  it('passes through already-normalised 233-prefixed number', () => {
    expect(normaliseGhanaPhone('233244123456')).toBe('233244123456')
  })

  it('normalises 9-digit number without any prefix', () => {
    expect(normaliseGhanaPhone('244123456')).toBe('233244123456')
  })

  it('returns null for clearly invalid string', () => {
    expect(normaliseGhanaPhone('invalid')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normaliseGhanaPhone('')).toBeNull()
  })

  it('handles null gracefully via buildWhatsAppLink (null passed as string)', () => {
    // The TypeScript signature takes string, but at runtime callers may pass null.
    // Verify the function does not throw and returns null.
    expect(normaliseGhanaPhone(null as unknown as string)).toBeNull()
  })
})
