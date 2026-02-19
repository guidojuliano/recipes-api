import { FastifyPluginAsync } from 'fastify'
import { createSupabaseClient } from '../config/supabase'
import { getBearerToken, requireUser } from '../utils/auth'

const FAVORITES_TABLE = 'favorites'
const PUSH_TOKENS_TABLE = 'push_tokens'

interface FavoriteRow {
  recipe: Record<string, unknown> | null
}

interface PushTokenBody {
  device_token?: unknown
  platform?: unknown
  device_id?: unknown
  app_version?: unknown
}

interface RemovePushTokenBody {
  device_token?: unknown
}

const me: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.post(
    '/me/push-token',
    {
      schema: {
        tags: ['push'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['device_token', 'platform'],
          properties: {
            device_token: { type: 'string' },
            platform: { type: 'string', enum: ['android', 'ios', 'web'] },
            device_id: { type: 'string' },
            app_version: { type: 'string' },
          },
          additionalProperties: false,
        },
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    async (request) => {
      const user = await requireUser(request)
      const token = getBearerToken(request.headers.authorization)
      const authedSupabase = createSupabaseClient(token ?? undefined)

      const body = request.body as PushTokenBody
      const deviceToken =
        typeof body.device_token === 'string' ? body.device_token.trim() : ''
      const platform = typeof body.platform === 'string' ? body.platform.trim() : ''
      const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : null
      const appVersion =
        typeof body.app_version === 'string' ? body.app_version.trim() : null

      if (!deviceToken) {
        throw request.server.httpErrors.badRequest('device_token is required')
      }

      if (!['android', 'ios', 'web'].includes(platform)) {
        throw request.server.httpErrors.badRequest('Invalid platform')
      }

      const { data, error } = await authedSupabase
        .from(PUSH_TOKENS_TABLE)
        .upsert(
          {
            user_id: user.id,
            device_token: deviceToken,
            platform,
            device_id: deviceId,
            app_version: appVersion,
            is_active: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'device_token' },
        )
        .select('*')
        .single()

      if (error) {
        throw request.server.httpErrors.internalServerError(error.message)
      }

      return data
    },
  )

  fastify.delete(
    '/me/push-token',
    {
      schema: {
        tags: ['push'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['device_token'],
          properties: {
            device_token: { type: 'string' },
          },
          additionalProperties: false,
        },
        response: {
          204: { type: 'null' },
        },
      },
    },
    async (request, reply) => {
      const user = await requireUser(request)
      const token = getBearerToken(request.headers.authorization)
      const authedSupabase = createSupabaseClient(token ?? undefined)
      const body = request.body as RemovePushTokenBody
      const deviceToken =
        typeof body.device_token === 'string' ? body.device_token.trim() : ''

      if (!deviceToken) {
        throw request.server.httpErrors.badRequest('device_token is required')
      }

      const { error } = await authedSupabase
        .from(PUSH_TOKENS_TABLE)
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('device_token', deviceToken)

      if (error) {
        throw request.server.httpErrors.internalServerError(error.message)
      }

      reply.code(204)
      return null
    },
  )

  fastify.get(
    '/me/favorites',
    {
      schema: {
        tags: ['favorites'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (request) => {
      const user = await requireUser(request)
      const token = getBearerToken(request.headers.authorization)
      const authedSupabase = createSupabaseClient(token ?? undefined)

      const { data: favorites, error: favoritesError } = await authedSupabase
        .from(FAVORITES_TABLE)
        .select('recipe:recipe_id(*, recipe_categories(category_id))')
        .eq('user_id', user.id)

      if (favoritesError) {
        throw request.server.httpErrors.internalServerError(favoritesError.message)
      }

      const recipes = (favorites as unknown as FavoriteRow[] | null)
        ?.map((favorite) => favorite.recipe)
        .filter((recipe): recipe is Record<string, unknown> => Boolean(recipe))

      if (!recipes || recipes.length === 0) {
        return []
      }

      const ownerIds = Array.from(
        new Set(
          recipes
            .map((recipe) => (recipe.owner_id ? recipe.owner_id : null))
            .filter((ownerId): ownerId is string => Boolean(ownerId)),
        ),
      )

      if (ownerIds.length === 0) {
        return recipes
      }

      const { data: owners, error: ownersError } = await authedSupabase
        .from('profiles')
        .select('id,display_name,avatar_url')
        .in('id', ownerIds)

      if (ownersError) {
        throw request.server.httpErrors.internalServerError(ownersError.message)
      }

      const ownersById = new Map((owners ?? []).map((owner) => [owner.id, owner]))

      return recipes.map((recipe) => ({
        ...recipe,
        owner: ownersById.get(recipe.owner_id) ?? null,
      }))
    },
  )
}

export default me