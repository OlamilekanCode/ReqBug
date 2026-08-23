import {
  CapabilityTokenSchema,
} from '@reqbug/contracts'

const bearerCapabilityPattern =
  /^Bearer ([A-Za-z0-9_-]{43})$/iu

export function getBearerCapability(
  request: Request,
): string | null {
  const authorization =
    request.headers.get('authorization')

  if (authorization === null) {
    return null
  }

  const match =
    bearerCapabilityPattern.exec(
      authorization,
    )

  const capabilityToken =
    match?.[1]

  if (
    capabilityToken === undefined ||
    !CapabilityTokenSchema.safeParse(
      capabilityToken,
    ).success
  ) {
    return null
  }

  return capabilityToken
}