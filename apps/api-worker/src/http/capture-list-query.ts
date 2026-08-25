import {
  DEFAULT_CAPTURE_LIST_PAGE_SIZE,
  MAX_CAPTURE_LIST_PAGE_SIZE,
} from '@reqbug/contracts'

export type CaptureListParameters =
  | {
      readonly valid: true
      readonly before: number | null
      readonly limit: number
    }
  | {
      readonly valid: false
    }

function parsePositiveInteger(
  value: string,
): number | null {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    return null
  }

  const parsed = Number(value)

  return Number.isSafeInteger(parsed)
    ? parsed
    : null
}

export function parseCaptureListParameters(
  requestUrl: string,
): CaptureListParameters {
  const url = new URL(requestUrl)

  const beforeValues =
    url.searchParams.getAll('before')

  const limitValues =
    url.searchParams.getAll('limit')

  if (
    beforeValues.length > 1 ||
    limitValues.length > 1
  ) {
    return {
      valid: false,
    }
  }

  let before: number | null = null

  if (beforeValues.length === 1) {
    const parsedBefore =
      parsePositiveInteger(
        beforeValues[0]!,
      )

    if (parsedBefore === null) {
      return {
        valid: false,
      }
    }

    before = parsedBefore
  }

  let limit =
    DEFAULT_CAPTURE_LIST_PAGE_SIZE

  if (limitValues.length === 1) {
    const parsedLimit =
      parsePositiveInteger(
        limitValues[0]!,
      )

    if (
      parsedLimit === null ||
      parsedLimit >
        MAX_CAPTURE_LIST_PAGE_SIZE
    ) {
      return {
        valid: false,
      }
    }

    limit = parsedLimit
  }

  return {
    valid: true,
    before,
    limit,
  }
}
