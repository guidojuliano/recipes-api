import { FastifyPluginAsync } from 'fastify'
import { supabase } from '../config/supabase'
import { localizeCategory, resolveLanguage } from '../utils/language'

const CATEGORIES_TABLE = 'categories'

const categories: FastifyPluginAsync = async (fastify): Promise<void> => {
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
      const language = resolveLanguage(request)
      const { data, error } = await supabase
        .from(CATEGORIES_TABLE)
        .select('id,slug,name,en,es,pt,sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (error) {
        throw request.server.httpErrors.internalServerError(error.message)
      }

      return (data ?? []).map((category) => localizeCategory(category, language))
    },
  )
}

export default categories
