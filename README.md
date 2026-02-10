# Cookly Recipes API

API de recetas con Fastify y Supabase.

## Requisitos

- Node.js 18+
- Cuenta de Supabase

## Variables de entorno

Crea un `.env` en la raíz con:

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

## Scripts

- `npm run dev` inicia en modo desarrollo
- `npm start` producción
- `npm run test` tests

Servidor por defecto: `http://localhost:3000`

## Endpoints

Públicos:

- `GET /` lista endpoints y estado
- `GET /recipes?q=&category=` lista recetas (filtros opcionales)

Protegidos (Bearer Token):

- `POST /recipes` crea receta
- `POST /recipes/:id/favorite` agrega a favoritos
- `DELETE /recipes/:id/favorite` elimina de favoritos
- `GET /me/favorites` lista favoritos del usuario

### Body esperado en `POST /recipes`

```
{
  "title": "Pasta",
  "ingredients": ["tomate", "ajo"],
  "instructions": "Hervir...",
  "image_url": "https://...",
  "category_ids": [1, 3]
}
```

Reglas de validación:

- `title`, `ingredients`, `instructions` son obligatorios
- Si `image_url` es `null` o vacío, se usa un placeholder
- `category_ids` es opcional (usa IDs de la tabla `categories`)

## Categorías

La relación es many‑to‑many:

- `recipes`
- `categories`
- `recipe_categories` (tabla puente)

El filtro `category` en `GET /recipes` usa el `slug` de `categories`.

## Autenticación

Usa `Authorization: Bearer <token>` con tokens de Supabase.

## Swagger

Documentación disponible en:

- `http://localhost:3000/docs`

El OpenAPI se genera automáticamente desde los schemas de las rutas.
