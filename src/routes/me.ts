import { FastifyPluginAsync } from 'fastify'
import { createSupabaseClient } from '../config/supabase'
import { getBearerToken, requireUser } from '../utils/auth'

const FAVORITES_TABLE = 'favorites'

interface FavoriteRow {
  recipe: Record<string, unknown> | null
}

const me: FastifyPluginAsync = async (fastify): Promise<void> => {
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
