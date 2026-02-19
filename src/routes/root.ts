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
          'PATCH /recipes/:id',
          'DELETE /recipes/:id',
          'POST /recipes/:id/favorite',
          'DELETE /recipes/:id/favorite',
          'GET /me/favorites',
          'POST /me/push-token',
          'DELETE /me/push-token',
          'GET /users/:id/followers',
          'GET /users/:id/following',
          'POST /users/:id/follow',
          'DELETE /users/:id/follow',
          'GET /feed/following',
        ],
        auth: 'Use Authorization: Bearer <token> for protected endpoints',
      }
    },
  )
}

export default root