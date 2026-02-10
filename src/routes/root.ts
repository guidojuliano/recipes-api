import { FastifyPluginAsync } from 'fastify'

const root: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/', async function (request, reply) {
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
  })
}

export default root
