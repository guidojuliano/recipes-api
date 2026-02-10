import { FastifyRequest } from 'fastify'
import { supabase } from '../config/supabase'

export function getBearerToken(authHeader?: string) {
  if (!authHeader) return null
  const [type, token] = authHeader.split(' ')
  if (type !== 'Bearer' || !token) return null
  return token
}

export async function requireUser(request: FastifyRequest) {
  const token = getBearerToken(request.headers.authorization)
  if (!token) {
    throw request.server.httpErrors.unauthorized('Missing bearer token')
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    throw request.server.httpErrors.unauthorized('Invalid token')
  }

  return data.user
}
