export function serializeUser(row: any, withStats = false) {
  const user: any = { id: row.id, telegramUserId: String(row.telegram_user_id), telegramUsername: row.telegram_username, displayName: row.display_name, bio: row.bio, avatarUrl: row.avatar_url, homeCity: row.home_city, homeCoordinates: row.home_lat == null ? null : { lat: Number(row.home_lat), lng: Number(row.home_lng) }, isOnboardingCompleted: row.is_onboarding_completed, quickStartCompleted: row.quick_start_completed, isFollowing: row.is_following, isFriend: row.is_friend };
  if (withStats) user.stats = { followers: Number(row.followers_count ?? 0), following: Number(row.following_count ?? 0), friends: Number(row.friends_count ?? 0), visited: Number(row.visited_count ?? 0), wishlist: Number(row.wishlist_count ?? 0), collections: Number(row.collections_count ?? 0) };
  return user;
}

export function serializePlace(row: any) {
  return { id: row.place_id ?? row.id, name: row.place_name ?? row.name, description: row.place_description ?? row.description ?? null,
    categoryCode: row.category_code ?? 'other', categoryName: row.category_name ?? 'Другое',
    coordinates: { lat: Number(row.lat), lng: Number(row.lng) }, city: row.city ?? null, region: row.region ?? null, countryName: row.country_name ?? null, countryCode: row.country_code ?? null, address: row.address ?? null,
    entriesCount: Number(row.entries_count ?? 0), visitedCount: Number(row.visited_count ?? 0), wishlistCount: Number(row.wishlist_count ?? 0), popularity: Number(row.popularity_score ?? 0) };
}

export function serializeEntry(row: any) {
  return { id: row.id, userId: row.user_id, placeId: row.place_id, entryType: row.entry_type, title: row.title, description: row.description,
    visitDate: row.visit_date ? new Date(row.visit_date).toISOString().slice(0, 10) : null, visibility: row.visibility,
    icon: row.icon_code ?? 'pin', iconColor: row.icon_color ?? '#ef6c56', commentsEnabled: row.comments_enabled,
    viewsCount: Number(row.views_count), commentsCount: Number(row.comments_count), createdAt: new Date(row.created_at).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    author: { id: row.user_id, displayName: row.display_name, avatarUrl: row.avatar_url, telegramUsername: row.telegram_username },
    place: serializePlace(row), media: row.media ?? [] };
}

export const entrySelect = `
  SELECT e.*, p.name place_name, p.description place_description, p.city, p.region, p.country_name, p.country_code, p.address, p.popularity_score,
    ST_Y(p.location::geometry) lat, ST_X(p.location::geometry) lng, pc.code category_code, pc.name category_name,
    u.display_name, u.avatar_url, u.telegram_username, mi.code icon_code,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'originalUrl',m.original_url,'mediumUrl',m.medium_url,'thumbnailUrl',m.thumbnail_url,'width',m.width,'height',m.height) ORDER BY em.sort_order) FROM map_entry_media em JOIN media m ON m.id=em.media_id WHERE em.map_entry_id=e.id AND m.deleted_at IS NULL),'[]') media
  FROM map_entries e JOIN places p ON p.id=e.place_id LEFT JOIN place_categories pc ON pc.id=p.category_id
  JOIN users u ON u.id=e.user_id LEFT JOIN marker_icons mi ON mi.id=e.marker_icon_id`;
