import fastify from 'fastify'
import app from '../src/app'

const server = fastify({ logger: true })

void server.register(app)

export default async function handler(req: any, res: any) {
  await server.ready()
  server.server.emit('request', req, res)
}
