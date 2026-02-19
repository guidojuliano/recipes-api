import { FastifyPluginAsync } from 'fastify'
import { createSupabaseClient } from '../config/supabase'
import { getBearerToken, requireUser } from '../utils/auth'
import { localizeRecipeCategories, resolveLanguage } from '../utils/language'

const FOLLOWS_TABLE = 'follows'
const RECIPES_TABLE = 'recipes'

interface FollowingFeedQuerystring {
  limit?: number
  offset?: number
}

interface FollowRow {
  followed_id: string
}

const feed: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get(
    '/feed/following',
    {
      schema: {
        tags: ['feed'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 },
          },
          additionalProperties: false,
        },
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
      const language = resolveLanguage(request)
      const { limit = 30, offset = 0 } =
        request.query as FollowingFeedQuerystring

      const { data: followingRows, error: followingError } = await authedSupabase
        .from(FOLLOWS_TABLE)
        .select('followed_id')
        .eq('follower_id', user.id)

      if (followingError) {
        throw request.server.httpErrors.internalServerError(followingError.message)
      }

      const followedIds = (followingRows as FollowRow[] | null)
        ?.map((row) => row.followed_id)
        .filter((id): id is string => Boolean(id))

      if (!followedIds || followedIds.length === 0) {
        return []
      }

      const to = offset + limit - 1
      const { data: recipes, error: recipesError } = await authedSupabase
        .from(RECIPES_TABLE)
        .select(
          '*, recipe_categories(category_id, category:category_id(id,slug,name,en,es,pt,sort_order))',
        )
        .in('owner_id', followedIds)
        .order('created_at', { ascending: false })
        .range(offset, to)

      if (recipesError) {
        throw request.server.httpErrors.internalServerError(recipesError.message)
      }

      const rows = recipes ?? []
      if (rows.length === 0) {
        return []
      }

      const ownerIds = Array.from(
        new Set(
          rows
            .map((recipe) => recipe.owner_id)
            .filter((ownerId): ownerId is string => Boolean(ownerId)),
        ),
      )

      if (ownerIds.length === 0) {
        return rows.map((recipe) => localizeRecipeCategories(recipe, language))
      }

      const { data: owners, error: ownersError } = await authedSupabase
        .from('profiles')
        .select('id,display_name,avatar_url')
        .in('id', ownerIds)

      if (ownersError) {
        throw request.server.httpErrors.internalServerError(ownersError.message)
      }

      const ownersById = new Map((owners ?? []).map((owner) => [owner.id, owner]))

      return rows.map((recipe) => {
        const localizedRecipe = localizeRecipeCategories(recipe, language)
        return {
          ...localizedRecipe,
          owner: ownersById.get(recipe.owner_id) ?? null,
        }
      })
    },
  )
}

export default feed