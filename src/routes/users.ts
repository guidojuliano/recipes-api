import { FastifyPluginAsync } from 'fastify'
import { createSupabaseClient } from '../config/supabase'
import { getBearerToken, requireUser } from '../utils/auth'

const FOLLOWS_TABLE = 'follows'
const PROFILES_TABLE = 'profiles'

interface UserParams {
  id: string
}

interface FollowRow {
  follower_id: string
  followed_id: string
  created_at: string
}

const users: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.post(
    '/users/:id/follow',
    {
      schema: {
        tags: ['follows'],
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
      const { id: followedId } = request.params as UserParams

      if (!followedId) {
        throw request.server.httpErrors.badRequest('Missing target user id')
      }

      if (followedId === user.id) {
        throw request.server.httpErrors.badRequest('You cannot follow yourself')
      }

      const { data: targetProfile, error: targetProfileError } = await authedSupabase
        .from(PROFILES_TABLE)
        .select('id')
        .eq('id', followedId)
        .maybeSingle()

      if (targetProfileError) {
        throw request.server.httpErrors.internalServerError(targetProfileError.message)
      }

      if (!targetProfile) {
        throw request.server.httpErrors.notFound('Target user not found')
      }

      const { data, error } = await authedSupabase
        .from(FOLLOWS_TABLE)
        .upsert(
          {
            follower_id: user.id,
            followed_id: followedId,
          },
          { onConflict: 'follower_id,followed_id' },
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
    '/users/:id/follow',
    {
      schema: {
        tags: ['follows'],
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
      const { id: followedId } = request.params as UserParams

      if (!followedId) {
        throw request.server.httpErrors.badRequest('Missing target user id')
      }

      const { error } = await authedSupabase
        .from(FOLLOWS_TABLE)
        .delete()
        .eq('follower_id', user.id)
        .eq('followed_id', followedId)

      if (error) {
        throw request.server.httpErrors.internalServerError(error.message)
      }

      reply.code(204)
      return null
    },
  )

  fastify.get(
    '/users/:id/followers',
    {
      schema: {
        tags: ['follows'],
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
          200: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (request) => {
      await requireUser(request)
      const token = getBearerToken(request.headers.authorization)
      const authedSupabase = createSupabaseClient(token ?? undefined)
      const { id: userId } = request.params as UserParams

      const { data: rows, error } = await authedSupabase
        .from(FOLLOWS_TABLE)
        .select('follower_id,created_at')
        .eq('followed_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        throw request.server.httpErrors.internalServerError(error.message)
      }

      const list = (rows as Pick<FollowRow, 'follower_id' | 'created_at'>[] | null) ?? []
      const followerIds = list.map((row) => row.follower_id)

      if (followerIds.length === 0) {
        return []
      }

      const { data: profiles, error: profilesError } = await authedSupabase
        .from(PROFILES_TABLE)
        .select('id,display_name,avatar_url')
        .in('id', followerIds)

      if (profilesError) {
        throw request.server.httpErrors.internalServerError(profilesError.message)
      }

      const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))

      return list.map((row) => ({
        user_id: row.follower_id,
        created_at: row.created_at,
        profile: profilesById.get(row.follower_id) ?? null,
      }))
    },
  )

  fastify.get(
    '/users/:id/following',
    {
      schema: {
        tags: ['follows'],
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
          200: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (request) => {
      await requireUser(request)
      const token = getBearerToken(request.headers.authorization)
      const authedSupabase = createSupabaseClient(token ?? undefined)
      const { id: userId } = request.params as UserParams

      const { data: rows, error } = await authedSupabase
        .from(FOLLOWS_TABLE)
        .select('followed_id,created_at')
        .eq('follower_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        throw request.server.httpErrors.internalServerError(error.message)
      }

      const list = (rows as Pick<FollowRow, 'followed_id' | 'created_at'>[] | null) ?? []
      const followedIds = list.map((row) => row.followed_id)

      if (followedIds.length === 0) {
        return []
      }

      const { data: profiles, error: profilesError } = await authedSupabase
        .from(PROFILES_TABLE)
        .select('id,display_name,avatar_url')
        .in('id', followedIds)

      if (profilesError) {
        throw request.server.httpErrors.internalServerError(profilesError.message)
      }

      const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))

      return list.map((row) => ({
        user_id: row.followed_id,
        created_at: row.created_at,
        profile: profilesById.get(row.followed_id) ?? null,
      }))
    },
  )
}

export default users