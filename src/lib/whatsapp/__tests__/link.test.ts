import { describe, it, expect } from 'vitest'
import { buildWhatsAppLink } from '../index'

describe('buildWhatsAppLink', () => {
  it('returns ok:true with a wa.me URL for a valid Ghana phone', () => {
    const result = buildWhatsAppLink('0244123456', 'Hello')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.url).toMatch(/^https:\/\/wa\.me\/233/)
    }
  })

  it('returns ok:false with reason no_phone when phone is null', () => {
    const result = buildWhatsAppLink(null, 'Hello')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('no_phone')
    }
  })

  it('returns ok:false with reason invalid_phone for unrecognised number', () => {
    const result = buildWhatsAppLink('invalid', 'Hello')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_phone')
    }
  })

  it('URL-encodes the message text', () => {
    const result = buildWhatsAppLink('0244123456', 'Hello World & More')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.url).toContain('Hello%20World%20%26%20More')
    }
  })

  it('handles a very long message without truncation', () => {
    const longMessage = 'A'.repeat(500)
    const result = buildWhatsAppLink('0244123456', longMessage)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.url).toContain(encodeURIComponent(longMessage))
    }
  })
})
