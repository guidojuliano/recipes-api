import { FastifyPluginAsync } from 'fastify'
import { supabase } from '../config/supabase'
import { requireUser } from '../utils/auth'

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

    const { data: favorites, error: favoritesError } = await supabase
      .from(FAVORITES_TABLE)
      .select('recipe:recipe_id(*, recipe_categories(category:categories(id,slug,name,sort_order)))')
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
    return recipes
  },
  )
}

export default me
