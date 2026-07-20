import { describe, expect, it } from 'vitest'

import { bytesToHex, hexToBytes } from './bytes.js'

describe('bytesToHex', () => {
  it('converts bytes to lowercase hexadecimal', () => {
    const bytes = new Uint8Array([0, 15, 16, 255])

    expect(bytesToHex(bytes)).toBe('000f10ff')
  })

  it('handles an empty byte array', () => {
    expect(bytesToHex(new Uint8Array())).toBe('')
  })
})

describe('hexToBytes', () => {
  it('converts valid hexadecimal to bytes', () => {
    expect(hexToBytes('000f10ff')).toEqual(
      new Uint8Array([0, 15, 16, 255]),
    )
  })

  it('accepts uppercase hexadecimal', () => {
    expect(hexToBytes('A0FF')).toEqual(
      new Uint8Array([160, 255]),
    )
  })

  it.each([
    '',
    'abc',
    'zz',
    '12 34',
  ])('rejects malformed hexadecimal: %s', (value) => {
    expect(hexToBytes(value)).toBeNull()
  })

  it('round-trips bytes without changing them', () => {
    const original = new Uint8Array([1, 32, 128, 254])

    expect(hexToBytes(bytesToHex(original))).toEqual(original)
  })
})