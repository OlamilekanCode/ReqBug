import { describe, expect, it } from 'vitest'

import {
  verifyGenericHmacSha256Signature,
} from '../src/providers/generic.js'

const encoder = new TextEncoder()

const secret = 'generic_test_secret'
const payload = encoder.encode('{"message":"hello"}')

const hexadecimalSignature =
  '0a62032be0edb27635982dade38324a97' +
  '019cdb50c037e59ce9ebe7af9d6fdd6'

const base64Signature =
  'CmIDK+DtsnY1mC2t44MkqXAZzbUMA35Zzp6+evnW/dY='

describe('verifyGenericHmacSha256Signature', () => {
  it('accepts a hexadecimal signature', async () => {
    const result = await verifyGenericHmacSha256Signature({
      secret,
      payload,
      signatureHeader: hexadecimalSignature,
      encoding: 'hex',
    })

    expect(result).toEqual({
      verified: true,
    })
  })

  it('accepts a Base64 signature', async () => {
    const result = await verifyGenericHmacSha256Signature({
      secret,
      payload,
      signatureHeader: base64Signature,
      encoding: 'base64',
    })

    expect(result).toEqual({
      verified: true,
    })
  })

  it('accepts a signature with the configured prefix', async () => {
    const result = await verifyGenericHmacSha256Signature({
      secret,
      payload,
      signatureHeader: `sha256=${hexadecimalSignature}`,
      encoding: 'hex',
      signaturePrefix: 'sha256=',
    })

    expect(result).toEqual({
      verified: true,
    })
  })

  it('rejects a missing configured prefix', async () => {
    const result = await verifyGenericHmacSha256Signature({
      secret,
      payload,
      signatureHeader: hexadecimalSignature,
      encoding: 'hex',
      signaturePrefix: 'sha256=',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })

  it('rejects an altered payload', async () => {
    const result = await verifyGenericHmacSha256Signature({
      secret,
      payload: encoder.encode('{"message":"changed"}'),
      signatureHeader: hexadecimalSignature,
      encoding: 'hex',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'signature-mismatch',
    })
  })

  it('reports a missing secret', async () => {
    const result = await verifyGenericHmacSha256Signature({
      secret: '',
      payload,
      signatureHeader: hexadecimalSignature,
      encoding: 'hex',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'missing-secret',
    })
  })

  it('reports a missing signature', async () => {
    const result = await verifyGenericHmacSha256Signature({
      secret,
      payload,
      signatureHeader: null,
      encoding: 'hex',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'missing-signature',
    })
  })

  it('rejects malformed encoded signatures', async () => {
    const result = await verifyGenericHmacSha256Signature({
      secret,
      payload,
      signatureHeader: '%%%%',
      encoding: 'base64',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })

  it('rejects a decoded signature with the wrong length', async () => {
    const result = await verifyGenericHmacSha256Signature({
      secret,
      payload,
      signatureHeader: 'AA==',
      encoding: 'base64',
    })

    expect(result).toEqual({
      verified: false,
      reason: 'invalid-signature-format',
    })
  })
})