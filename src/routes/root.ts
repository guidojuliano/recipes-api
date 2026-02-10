import { FastifyPluginAsync } from 'fastify'

const root: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['meta'],
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    async function () {
      return {
        root: true,
        endpoints: [
          'GET /recipes?q=&category=',
          'POST /recipes',
          'POST /recipes/:id/favorite',
          'DELETE /recipes/:id/favorite',
          'GET /me/favorites',
        ],
        auth: 'Use Authorization: Bearer <token> for protected endpoints',
      }
    },
  )
}

export default root
