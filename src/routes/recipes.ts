import { FastifyPluginAsync } from 'fastify'
import { createSupabaseClient, supabase } from '../config/supabase'
import { getBearerToken, requireUser } from '../utils/auth'

const RECIPES_TABLE = 'recipes'
const FAVORITES_TABLE = 'favorites'
const CATEGORIES_TABLE = 'categories'
const RECIPE_CATEGORIES_TABLE = 'recipe_categories'
const DEFAULT_RECIPE_IMAGE_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27512%27%20height%3D%27512%27%20viewBox%3D%270%200%20512%20512%27%3E%3Crect%20width%3D%27512%27%20height%3D%27512%27%20rx%3D%2796%27%20fill%3D%27%23673ab7%27/%3E%3Ctext%20x%3D%2750%25%27%20y%3D%2750%25%27%20text-anchor%3D%27middle%27%20dominant-baseline%3D%27middle%27%20font-family%3D%27Arial%2C%20sans-serif%27%20font-size%3D%2748%27%20font-weight%3D%27700%27%20letter-spacing%3D%272%27%20fill%3D%27%23ffffff%27%3ENO%20IMAGE%3C/text%3E%3C/svg%3E"

interface RecipesQuerystring {
  q?: string
  category?: string
}

interface FavoriteParams {
  id: string
}

interface RecipeCategoryLink {
  recipe_id: string
}

const recipes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get(
    '/categories',
    {
      schema: {
        tags: ['categories'],
        response: {
          200: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (request) => {
      const { data, error } = await supabase
        .from(CATEGORIES_TABLE)
        .select('id,slug,name,sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (error) {
        throw request.server.httpErrors.internalServerError(error.message)
      }

      return data ?? []
    },
  )
  fastify.get(
    '/recipes',
    {
      schema: {
        tags: ['recipes'],
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            category: { type: 'string' },
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
    const { q, category } = request.query as RecipesQuerystring
    const qTrimmed = q?.trim()
    const categoryTrimmed = category?.trim()

    const selectWithCategories =
      '*, recipe_categories(category:categories(id,slug,name,sort_order))'

    if (categoryTrimmed) {
      const { data: categoryRow, error: categoryError } = await supabase
        .from(CATEGORIES_TABLE)
        .select('id')
        .eq('slug', categoryTrimmed)
        .maybeSingle()

      if (categoryError) {
        throw request.server.httpErrors.internalServerError(categoryError.message)
      }

      if (!categoryRow?.id) {
        return []
      }

      const { data: recipeLinks, error: linksError } = await supabase
        .from(RECIPE_CATEGORIES_TABLE)
        .select('recipe_id')
        .eq('category_id', categoryRow.id)

      if (linksError) {
        throw request.server.httpErrors.internalServerError(linksError.message)
      }

      const recipeIds = (recipeLinks as RecipeCategoryLink[] | null)
        ?.map((link) => link.recipe_id)
        .filter((recipeId): recipeId is string => Boolean(recipeId))

      if (!recipeIds || recipeIds.length === 0) {
        return []
      }

      let query = supabase.from(RECIPES_TABLE).select(selectWithCategories).in('id', recipeIds)
      if (qTrimmed) {
        query = query.ilike('title', `%${qTrimmed}%`)
      }

      const { data, error } = await query
      if (error) {
        throw request.server.httpErrors.internalServerError(error.message)
      }

      const recipes = data ?? []
      if (recipes.length === 0) return []

      const ownerIds = Array.from(
        new Set(recipes.map((recipe) => recipe.owner_id).filter(Boolean)),
      )

      if (ownerIds.length === 0) return recipes

      const { data: owners, error: ownersError } = await supabase
        .from('profiles')
        .select('id,display_name,avatar_url')
        .in('id', ownerIds)

      if (ownersError) {
        throw request.server.httpErrors.internalServerError(ownersError.message)
      }

      const ownersById = new Map(
        (owners ?? []).map((owner) => [owner.id, owner]),
      )

      return recipes.map((recipe) => ({
        ...recipe,
        owner: ownersById.get(recipe.owner_id) ?? null,
      }))
    }

    let query = supabase.from(RECIPES_TABLE).select(selectWithCategories)

    if (qTrimmed) {
      query = query.ilike('title', `%${qTrimmed}%`)
    }

    const { data, error } = await query
    if (error) {
      throw request.server.httpErrors.internalServerError(error.message)
    }

    const recipes = data ?? []
    if (recipes.length === 0) return []

    const ownerIds = Array.from(
      new Set(recipes.map((recipe) => recipe.owner_id).filter(Boolean)),
    )

    if (ownerIds.length === 0) return recipes

    const { data: owners, error: ownersError } = await supabase
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

  fastify.post(
    '/recipes',
    {
      schema: {
        tags: ['recipes'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['title', 'ingredients', 'instructions'],
          properties: {
            title: { type: 'string' },
            ingredients: { type: 'array', items: { type: 'string' } },
            instructions: { type: 'string' },
            image_url: { type: ['string', 'null'] },
            category_ids: { type: 'array', items: { type: ['integer', 'string'] } },
          },
          additionalProperties: true,
        },
        response: {
          201: { type: 'object', additionalProperties: true },
        },
      },
    },
    async (request, reply) => {
    const user = await requireUser(request)
    const token = getBearerToken(request.headers.authorization)
    const authedSupabase = createSupabaseClient(token ?? undefined)

    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      throw request.server.httpErrors.badRequest('Invalid body')
    }

    const { categories, category_ids, ...rest } = request.body as Record<string, unknown>

    const title = typeof rest.title === 'string' ? rest.title.trim() : ''
    const instructions = typeof rest.instructions === 'string' ? rest.instructions.trim() : ''
    const ingredients = Array.isArray(rest.ingredients)
      ? rest.ingredients
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : []

    if (!title) {
      throw request.server.httpErrors.badRequest('Missing title')
    }
    if (!instructions) {
      throw request.server.httpErrors.badRequest('Missing instructions')
    }
    if (ingredients.length === 0) {
      throw request.server.httpErrors.badRequest('Missing ingredients')
    }

    const imageUrl =
      typeof rest.image_url === 'string' && rest.image_url.trim().length > 0
        ? rest.image_url.trim()
        : DEFAULT_RECIPE_IMAGE_URL

    const payload = {
      ...rest,
      title,
      instructions,
      ingredients,
      image_url: imageUrl,
      owner_id: user.id,
    }

    const { data, error } = await authedSupabase
      .from(RECIPES_TABLE)
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      throw request.server.httpErrors.internalServerError(error.message)
    }

    const rawCategoryIds = Array.isArray(category_ids)
      ? category_ids
      : Array.isArray(categories)
        ? categories
        : []

    const normalizedCategoryIds = rawCategoryIds
      .map((value) => (typeof value === 'number' || typeof value === 'string' ? value : null))
      .filter((value): value is number | string => value !== null)

    if (normalizedCategoryIds.length > 0) {
      const { error: linkError } = await authedSupabase
        .from(RECIPE_CATEGORIES_TABLE)
        .upsert(
          normalizedCategoryIds.map((categoryId) => ({
            recipe_id: data.id,
            category_id: categoryId,
          })),
          { onConflict: 'recipe_id,category_id' },
        )

      if (linkError) {
        throw request.server.httpErrors.internalServerError(linkError.message)
      }

      const { data: recipeWithCategories, error: recipeError } = await authedSupabase
        .from(RECIPES_TABLE)
        .select('*, recipe_categories(category:categories(id,slug,name,sort_order))')
        .eq('id', data.id)
        .single()

      if (recipeError) {
        throw request.server.httpErrors.internalServerError(recipeError.message)
      }

      const { data: owner, error: ownerError } = await authedSupabase
        .from('profiles')
        .select('id,display_name,avatar_url')
        .eq('id', data.owner_id)
        .maybeSingle()

      if (ownerError) {
        throw request.server.httpErrors.internalServerError(ownerError.message)
      }

      reply.code(201)
      return {
        ...recipeWithCategories,
        owner: owner ?? null,
      }
    }

    reply.code(201)
    const { data: owner, error: ownerError } = await authedSupabase
      .from('profiles')
      .select('id,display_name,avatar_url')
      .eq('id', data.owner_id)
      .maybeSingle()

    if (ownerError) {
      throw request.server.httpErrors.internalServerError(ownerError.message)
    }

    return {
      ...data,
      owner: owner ?? null,
    }
  },
  )

  fastify.post(
    '/recipes/:id/favorite',
    {
      schema: {
        tags: ['favorites'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
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
    const { id } = request.params as FavoriteParams

    if (!id) {
      throw request.server.httpErrors.badRequest('Missing recipe id')
    }

    const { data, error } = await authedSupabase
      .from(FAVORITES_TABLE)
      .upsert(
        {
          user_id: user.id,
          recipe_id: id,
        },
        { onConflict: 'user_id,recipe_id' },
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
    '/recipes/:id/favorite',
    {
      schema: {
        tags: ['favorites'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
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
    const { id } = request.params as FavoriteParams

    if (!id) {
      throw request.server.httpErrors.badRequest('Missing recipe id')
    }

    const { error } = await authedSupabase
      .from(FAVORITES_TABLE)
      .delete()
      .eq('user_id', user.id)
      .eq('recipe_id', id)

    if (error) {
      throw request.server.httpErrors.internalServerError(error.message)
    }

    reply.code(204)
    return null
  },
  )
}

export default recipes
