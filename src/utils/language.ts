import { FastifyRequest } from 'fastify'

export type SupportedLanguage = 'es' | 'en' | 'pt'

function parseLanguage(raw: unknown): SupportedLanguage | null {
  if (typeof raw !== 'string') return null
  const value = raw.toLowerCase().trim()
  if (value.startsWith('en')) return 'en'
  if (value.startsWith('pt')) return 'pt'
  if (value.startsWith('es')) return 'es'
  return null
}

export function resolveLanguage(request: FastifyRequest): SupportedLanguage {
  const query = request.query as Record<string, unknown> | undefined
  const fromQuery = parseLanguage(query?.lang)
  if (fromQuery) return fromQuery

  const header = request.headers['accept-language']
  const headerValue = Array.isArray(header) ? header[0] : header
  if (typeof headerValue === 'string') {
    const first = headerValue.split(',')[0]
    const fromHeader = parseLanguage(first)
    if (fromHeader) return fromHeader
  }

  return 'es'
}

export function localizeCategory(
  category: Record<string, unknown> | null | undefined,
  language: SupportedLanguage,
): Record<string, unknown> | null {
  if (!category) return null

  const localized = category[language]
  const fallback = category.name
  const name =
    typeof localized === 'string' && localized.trim().length > 0
      ? localized
      : typeof fallback === 'string'
        ? fallback
        : ''

  return {
    ...category,
    name,
  }
}

export function localizeRecipeCategories<T extends Record<string, unknown>>(
  recipe: T,
  language: SupportedLanguage,
): T {
  const raw = recipe.recipe_categories
  if (!Array.isArray(raw)) return recipe

  const recipeCategories = raw.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry
    const row = entry as Record<string, unknown>
    const category =
      row.category && typeof row.category === 'object'
        ? (row.category as Record<string, unknown>)
        : null
    return {
      ...row,
      category: localizeCategory(category, language),
    }
  })

  return {
    ...recipe,
    recipe_categories: recipeCategories,
  }
}
