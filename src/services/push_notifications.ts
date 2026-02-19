import { createSign } from 'node:crypto'
import { FastifyBaseLogger } from 'fastify'
import { adminSupabase } from '../config/supabase'

const FOLLOWS_TABLE = 'follows'
const PUSH_TOKENS_TABLE = 'push_tokens'

interface NotifyFollowersInput {
  authorId: string
  authorName: string
  recipeId: string
  recipeTitle: string
  logger?: FastifyBaseLogger
}

interface FollowRow {
  follower_id: string
}

interface PushTokenRow {
  device_token: string
}

export async function notifyFollowersNewRecipe(
  input: NotifyFollowersInput,
): Promise<void> {
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID
  const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const firebasePrivateKeyRaw = process.env.FIREBASE_PRIVATE_KEY
  const firebasePrivateKey = firebasePrivateKeyRaw?.replace(/\\n/g, '\n')

  if (!adminSupabase) {
    input.logger?.warn(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. Skipping follower push notifications.',
    )
    return
  }

  if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
    input.logger?.warn(
      'Missing FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY. Skipping push notifications.',
    )
    return
  }

  const { data: followerRows, error: followerError } = await adminSupabase
    .from(FOLLOWS_TABLE)
    .select('follower_id')
    .eq('followed_id', input.authorId)

  if (followerError) {
    input.logger?.error({ err: followerError }, 'Failed to load followers')
    return
  }

  const followerIds = (followerRows as FollowRow[] | null)
    ?.map((row) => row.follower_id)
    .filter((id): id is string => Boolean(id))

  if (!followerIds || followerIds.length === 0) {
    return
  }

  const { data: tokenRows, error: tokenError } = await adminSupabase
    .from(PUSH_TOKENS_TABLE)
    .select('device_token')
    .eq('is_active', true)
    .in('user_id', followerIds)

  if (tokenError) {
    input.logger?.error({ err: tokenError }, 'Failed to load follower push tokens')
    return
  }

  const tokens = Array.from(
    new Set(
      ((tokenRows as PushTokenRow[] | null) ?? [])
        .map((row) => row.device_token)
        .filter((token): token is string => Boolean(token)),
    ),
  )

  if (tokens.length === 0) {
    return
  }

  const accessToken = await getGoogleAccessToken({
    clientEmail: firebaseClientEmail,
    privateKey: firebasePrivateKey,
    logger: input.logger,
  })

  if (!accessToken) {
    return
  }

  await Promise.all(
    tokens.map((token) =>
      sendFcmV1(token, {
        title: `Nueva receta de ${input.authorName}`,
        body: input.recipeTitle,
        data: {
          type: 'new_recipe',
          recipe_id: input.recipeId,
          author_id: input.authorId,
        },
        firebaseProjectId,
        accessToken,
        logger: input.logger,
      }),
    ),
  )
}

interface SendFcmInput {
  title: string
  body: string
  data: Record<string, string>
  firebaseProjectId: string
  accessToken: string
  logger?: FastifyBaseLogger
}

async function sendFcmV1(token: string, input: SendFcmInput): Promise<void> {
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${input.firebaseProjectId}/messages:send`,
      {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: input.title,
            body: input.body,
          },
          data: input.data,
        },
        android: {
          priority: 'high',
        },
      }),
      },
    )

    if (!response.ok) {
      const errorBody = await response.text()
      input.logger?.warn(
        { status: response.status, token, errorBody },
        'FCM send failed',
      )
    }
  } catch (error) {
    input.logger?.error({ err: error, token }, 'Unexpected FCM send error')
  }
}

interface AccessTokenInput {
  clientEmail: string
  privateKey: string
  logger?: FastifyBaseLogger
}

interface CachedAccessToken {
  token: string
  expiresAtMs: number
}

let cachedAccessToken: CachedAccessToken | null = null

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createServiceAccountJwt(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`

  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign(privateKey)

  return `${unsignedToken}.${toBase64Url(signature)}`
}

async function getGoogleAccessToken(
  input: AccessTokenInput,
): Promise<string | null> {
  const now = Date.now()
  if (cachedAccessToken && cachedAccessToken.expiresAtMs - 60_000 > now) {
    return cachedAccessToken.token
  }

  const assertion = createServiceAccountJwt(input.clientEmail, input.privateKey)

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      input.logger?.warn(
        { status: response.status, errorBody },
        'Failed to obtain Google OAuth access token for FCM',
      )
      return null
    }

    const tokenResponse = (await response.json()) as {
      access_token?: string
      expires_in?: number
    }

    if (!tokenResponse.access_token) {
      input.logger?.warn('Google OAuth token response did not include access_token')
      return null
    }

    const expiresIn = tokenResponse.expires_in ?? 3600
    cachedAccessToken = {
      token: tokenResponse.access_token,
      expiresAtMs: now + expiresIn * 1000,
    }

    return tokenResponse.access_token
  } catch (error) {
    input.logger?.error({ err: error }, 'Unexpected error requesting Google OAuth token')
    return null
  }
}
