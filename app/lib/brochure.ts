/** Build a public brochure URL from DB storage path or full URL. */
export function getBrochureHref(brochureUrl?: string | null): string | null {
  if (!brochureUrl) return null

  const trimmed = brochureUrl.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null

  const normalizedPath = trimmed.replace(/^\/+/, '')
  const hasBucketPrefix =
    normalizedPath.startsWith('storage/v1/object/public/') ||
    normalizedPath.startsWith('bidding-brochure/')

  const pathWithBucket = hasBucketPrefix
    ? normalizedPath
    : `bidding-brochure/${normalizedPath}`

  return `${supabaseUrl}/storage/v1/object/public/${pathWithBucket}`
}
