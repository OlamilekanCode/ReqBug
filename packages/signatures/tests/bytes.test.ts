import { describe, expect, it } from 'vitest'

import { bytesToHex, concatBytes, hexToBytes, base64ToBytes } from '../src/core/bytes.js'

describe('bytesToHex', () => {
  it('converts bytes to lowercase hexadecimal', () => {
    const bytes = new Uint8Array([0, 15, 16, 255])

    expect(bytesToHex(bytes)).toBe('000f10ff')
  })

  it('handles an empty byte array', () => {
    expect(bytesToHex(new Uint8Array())).toBe('')
  })
})

describe('concatBytes', () => {
  it('joins byte arrays in their original order', () => {
    const result = concatBytes(
      new Uint8Array([1, 2]),
      new Uint8Array(),
      new Uint8Array([3, 4]),
    )

    expect(result).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    )
  })

  it('returns an empty array when no chunks are provided', () => {
    expect(concatBytes()).toEqual(new Uint8Array())
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

describe('base64ToBytes', () => {
  it('decodes Base64 into its original bytes', () => {
    expect(base64ToBytes('AA8Q/w==')).toEqual(
      new Uint8Array([0, 15, 16, 255]),
    )
  })

  it('decodes a UTF-8-compatible text example', () => {
    expect(base64ToBytes('SGVsbG8=')).toEqual(
      new Uint8Array([72, 101, 108, 108, 111]),
    )
  })

  it.each([
    '',
    'abc',
    '%%%%',
    'AAAA=',
    'AA=A',
  ])('rejects malformed Base64: %s', (value) => {
    expect(base64ToBytes(value)).toBeNull()
  })
})