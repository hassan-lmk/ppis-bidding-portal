import { NextRequest, NextResponse } from 'next/server'
import { selectFromTable } from '../../lib/supabase-https'

/** Short cache: breaking news / blog lists can refresh frequently */
export const revalidate = 60

const BLOG_TABLE = 'blogs'

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function slugVariants(slug: string): string[] {
  const trimmed = slug.trim()
  const out = new Set<string>([trimmed])
  out.add(trimmed.replace(/_/g, '-'))
  out.add(trimmed.replace(/-/g, '_'))
  // Avoid spreading a Set (can break with TS targets < es2015)
  const arr: string[] = []
  out.forEach(v => arr.push(v))
  return arr
}

async function resolveBlogCategoryId(categoryParam: string): Promise<string | null> {
  if (isUuidLike(categoryParam)) return categoryParam

  const categories = await selectFromTable('blog_categories', '*', {}, 'created_at.desc', 1000)
  const list = Array.isArray(categories) ? categories : []
  const wanted = slugVariants(categoryParam)

  const priorityKeys = ['slug', 'key', 'code', 'name', 'category']

  for (const k of priorityKeys) {
    const match = list.find(
      (c: any) => typeof c?.[k] === 'string' && wanted.includes(String(c[k])),
    )
    if (match?.id) return match.id
    if (match?.category_id) return match.category_id
  }

  const fallbackMatch = list.find((c: any) =>
    Object.values(c || {}).some(
      (v: any) => typeof v === 'string' && wanted.includes(String(v)),
    ),
  )
  if (!fallbackMatch) return null
  if (fallbackMatch.id) return fallbackMatch.id
  if (fallbackMatch.category_id) return fallbackMatch.category_id
  return null
}

// GET /api/blogs?category=breaking_news&status=published&limit=1
// `blogs.category_id` is a UUID FK to `blog_categories.id`
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const categoryParam = searchParams.get('category')
    const status = searchParams.get('status')?.trim() || 'published'
    const limitRaw = searchParams.get('limit')
    const parsed = parseInt(limitRaw || '10', 10)
    const limit = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 10, 1), 50)

    const filters: Record<string, string> = { status }

    if (categoryParam?.trim()) {
      const resolvedCategoryId = await resolveBlogCategoryId(categoryParam.trim())
      if (!resolvedCategoryId) {
        return NextResponse.json([], {
          status: 200,
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
        })
      }

      filters.category_id = resolvedCategoryId
    }

    const rows = await selectFromTable(BLOG_TABLE, '*', filters, 'created_at.desc', limit)
    const list = Array.isArray(rows) ? rows : rows != null ? [rows] : []

    return NextResponse.json(list, {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  } catch (error) {
    console.error('GET /api/blogs:', error)
    return NextResponse.json({ error: 'Failed to fetch blogs' }, { status: 500 })
  }
}
