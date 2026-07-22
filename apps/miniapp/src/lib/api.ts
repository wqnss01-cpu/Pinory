import type { AuthResponse, CreateEntryInput, MapEntry, Place, User } from '@pinory/shared';
import { telegram } from './telegram';

export const apiBase = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api/v1' : 'http://localhost:4000/api/v1');
let token = localStorage.getItem('pinory.access');
let refreshPromise: Promise<string | null> | null = null;

function saveSession(data: AuthResponse) {
  token = data.accessToken;
  localStorage.setItem('pinory.access', data.accessToken);
  localStorage.setItem('pinory.refresh', data.refreshToken);
  return data.user;
}

function clearSession() {
  token = null;
  localStorage.removeItem('pinory.access');
  localStorage.removeItem('pinory.refresh');
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('pinory.refresh');
  if (!refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).then(async (response) => {
      if (!response.ok) {
        clearSession();
        return null;
      }
      const data = await response.json() as { accessToken: string };
      token = data.accessToken;
      localStorage.setItem('pinory.access', data.accessToken);
      return data.accessToken;
    }).catch(() => null).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, canRefresh = true): Promise<T> {
  const hasJsonBody = options.body !== undefined && !(options.body instanceof FormData);
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && canRefresh && path !== '/auth/refresh' && await refreshAccessToken()) {
    return request<T>(path, options, false);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({ message: 'Сервис временно недоступен' }));
  if (!response.ok) throw new Error(data.message ?? 'Ошибка запроса');
  return data as T;
}

export async function authenticate() {
  const params = new URLSearchParams(location.search);
  const data = await request<AuthResponse>('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData: telegram.initData, referral: telegram.startParam ?? params.get('ref') ?? undefined }),
  });
  return saveSession(data);
}

export async function authenticateMobileGrant(grant: string) {
  const data = await request<AuthResponse>('/auth/telegram/mobile/exchange', {
    method: 'POST',
    body: JSON.stringify({ grant }),
  }, false);
  return saveSession(data);
}

export interface GeocodeResult { id: string; name: string; address: string; city: string | null; region: string | null; countryName: string | null; countryCode: string | null; categoryCode: string; coordinates: { lat: number; lng: number } }
export interface CollectionSummary { id: string; userId: string; title: string; description: string | null; visibility: string; coverUrl: string | null; placesCount: number; followersCount: number; isFollowing: boolean; createdAt: string; author: { id: string; displayName: string; avatarUrl: string | null; telegramUsername?: string | null } }
export interface CollectionDetail extends CollectionSummary { entries: MapEntry[] }
export type ConnectionKind = 'followers' | 'following' | 'friends';
export interface FriendLocation { id: string; displayName: string; avatarUrl: string | null; telegramUsername: string | null; coordinates: { lat: number; lng: number }; accuracy: number | null; recordedAt: string; isLive: boolean }
export interface Achievement { code: string; title: string; description: string; icon: string; xp: number; tier?: number; progress: number; target: number; unlockedAt: string | null }
export interface AchievementsResponse { level: number; levelTitle: string; totalXp: number; levelXp: number; nextLevelXp: number; achievements: Achievement[] }
export interface AtlasSummary { places:number;cities:number;countries:number;unresolved_places:number;distance_km:number;favorite_category:string|null;favorite_count:number|null;farthest:{id:string;name:string;distance_km:number}|null;homeCity:string|null;year:number|null;month:number|null;onThisDay:MapEntry[] }
export interface ComparePlace { id:string;name:string;city:string|null;countryName:string|null;coordinates:{lat:number;lng:number} }
export interface TravelComparison { commonVisited:ComparePlace[];onlyMine:ComparePlace[];onlyTheirs:ComparePlace[];commonWishlist:ComparePlace[];together:ComparePlace[] }
export interface EntrySocial { counts:Record<string,number>;mine:string[];companions:{userId:string;status:string;displayName:string;avatarUrl:string|null}[];mergeSource:{entryId:string;displayName:string}|null }
export interface CollectionCollaboration { canEdit:boolean;members:{userId:string;role:string;status:string;displayName:string;avatarUrl:string|null}[];votes:Record<string,{count:number;mine:boolean}>;comments:{id:string;text:string;createdAt:string;author:{id:string;displayName:string;avatarUrl:string|null}}[] }

export const api = {
  me: () => request<User>('/auth/me'),
  user: (id: string) => request<User>(`/users/${id}`),
  updateMe: (data: unknown) => request<User>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  privacy: () => request<{showStatistics:boolean;showFollowers:boolean;showFollowing:boolean}>('/users/me/privacy'),
  updatePrivacy: (showStatistics:boolean) => request<{ok:boolean}>('/users/me/privacy',{method:'PATCH',body:JSON.stringify({showStatistics})}),
  connections: (id: string, kind: ConnectionKind) => request<{ items: User[]; nextCursor: string | null }>(`/users/${id}/${kind}?limit=50`),
  achievements: (id: string) => request<AchievementsResponse>(`/users/${id}/achievements`),
  atlasSummary: (id: string, year?: number, month?: number) => request<AtlasSummary>(`/users/${id}/atlas-summary?${new URLSearchParams({ ...(year ? { year:String(year) } : {}), ...(month ? { month:String(month) } : {}) })}`),
  compare: (id: string) => request<TravelComparison>(`/users/${id}/compare`),
  weeklyPulse: () => request<{friend_places:number;active_friends:number;cities:number;wishlistMatches:number}>('/pulse/weekly'),
  locationStatus: () => request<{ enabled: boolean }>('/locations/me/status'),
  updateLocation: (data: { lat: number; lng: number; accuracy?: number }) => request<{ enabled: boolean; recordedAt: string }>('/locations/me', { method: 'POST', body: JSON.stringify(data) }),
  disableLocation: () => request<void>('/locations/me', { method: 'DELETE' }),
  friendLocations: () => request<{ items: FriendLocation[] }>('/locations/friends'),
  map: (bbox: string, layers: string, entryTypes: string) => request<{ items: MapEntry[] }>(`/map/entries?bbox=${encodeURIComponent(bbox)}&zoom=10&layers=${encodeURIComponent(layers)}&entryTypes=${encodeURIComponent(entryTypes)}`),
  geocode: (query: string) => request<{ items: GeocodeResult[] }>(`/geocoding/search?query=${encodeURIComponent(query)}&limit=7`),
  reverseGeocode: (coordinates: { lat:number; lng:number }) => request<{ item: GeocodeResult }>(`/geocoding/reverse?lat=${coordinates.lat}&lng=${coordinates.lng}`),
  refreshMyPlacesGeography: () => request<{ refreshed:number; remaining:number }>('/geocoding/refresh-my-places',{method:'POST',body:'{}'}),
  createEntry: (data: CreateEntryInput) => request<MapEntry>('/entries', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(data) }),
  updateEntry: (id: string, data: unknown) => request<MapEntry>(`/entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEntry: (id: string) => request<void>(`/entries/${id}`, { method: 'DELETE' }),
  entry: (id: string) => request<MapEntry>(`/entries/${id}`),
  viewEntry: (id: string) => request<{ counted: boolean; viewsCount: number }>(`/entries/${id}/view`, { method: 'POST', body: '{}' }),
  entrySocial: (id:string) => request<EntrySocial>(`/entries/${id}/social`),
  reactEntry: (id:string,type:'WANT_HERE'|'ALSO_VISITED'|'LIKE') => request<{active:boolean}>(`/entries/${id}/reactions/${type}`,{method:'POST',body:'{}'}),
  unreactEntry: (id:string,type:'WANT_HERE'|'ALSO_VISITED'|'LIKE') => request<void>(`/entries/${id}/reactions/${type}`,{method:'DELETE'}),
  inviteCompanion: (id:string,userId:string) => request(`/entries/${id}/companions`,{method:'POST',body:JSON.stringify({userId})}),
  answerCompanion: (id:string,status:'CONFIRMED'|'DECLINED') => request(`/entries/${id}/companions/me`,{method:'PATCH',body:JSON.stringify({status})}),
  mergeMemory: (id:string,sourceEntryId:string) => request<{merged:boolean}>(`/entries/${id}/merge`,{method:'POST',body:JSON.stringify({sourceEntryId})}),
  stories: (id: string) => request<{ items: MapEntry[] }>(`/users/${id}/stories`),
  place: (id: string) => request<Place>(`/places/${id}`),
  feed: (kind: 'following' | 'nearby' | 'global') => request<{ items: MapEntry[] }>(`/feed/${kind}`),
  search: (query: string) => request<{ places: Place[]; users: User[]; collections: CollectionSummary[] }>(`/search?query=${encodeURIComponent(query)}&type=all`),
  userCollections: (id: string) => request<{ items: CollectionSummary[] }>(`/users/${id}/collections`),
  userEntries: (id: string) => request<{ items: MapEntry[] }>(`/users/${id}/entries`),
  collection: (id: string) => request<CollectionDetail>(`/collections/${id}`),
  collectionCollaboration: (id:string) => request<CollectionCollaboration>(`/collections/${id}/collaboration`),
  inviteCollectionMember: (id:string,userId:string) => request(`/collections/${id}/members`,{method:'POST',body:JSON.stringify({userId})}),
  answerCollectionInvite: (id:string,status:'ACCEPTED'|'DECLINED') => request(`/collections/${id}/members/me`,{method:'PATCH',body:JSON.stringify({status})}),
  voteCollectionEntry: (id:string,entryId:string) => request<{active:boolean}>(`/collections/${id}/votes/${entryId}`,{method:'POST',body:'{}'}),
  commentCollection: (id:string,text:string) => request(`/collections/${id}/comments`,{method:'POST',body:JSON.stringify({text})}),
  addCollaborativeEntry: (id:string,entryId:string) => request(`/collections/${id}/collaborative-entries`,{method:'POST',body:JSON.stringify({entryId})}),
  followCollection: (id: string) => request<{ following: boolean }>(`/collections/${id}/follow`, { method: 'POST', body: '{}' }),
  unfollowCollection: async (id: string) => { await request<void>(`/collections/${id}/follow`, { method: 'DELETE' }); return { following: false }; },
  collectionToWishlist: (id: string) => request<{ created: number }>(`/collections/${id}/add-all-to-wishlist`, { method: 'POST', body: '{}' }),
  notifications: () => request<{ items: any[] }>('/notifications'),
  invite: () => request<{ start_parameter: string }>('/invitations/me'),
  telegramShareLink: (start: string) => request<{ url: string }>(`/telegram/share-link?start=${encodeURIComponent(start)}`),
  follow: (id: string) => request<{ following: boolean; isFriend?: boolean }>(`/users/${id}/follow`, { method: 'POST', body: '{}' }),
  unfollow: async (id: string) => { await request<void>(`/users/${id}/follow`, { method: 'DELETE' }); return { following: false }; },
  createCollection: (data: unknown) => request<CollectionSummary>('/collections', { method: 'POST', body: JSON.stringify(data) }),
  comment: (id: string, text: string) => request(`/entries/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  comments: (id: string) => request<{ items: any[] }>(`/entries/${id}/comments`),
  upload: async (id: string, files: FileList) => { const body = new FormData(); [...files].forEach((file) => body.append('photos', file)); return request(`/entries/${id}/media`, { method: 'POST', body }); },
  uploadCollectionCover: async (id: string, file: File) => { const body = new FormData(); body.append('cover', file); return request<{ id: string; coverUrl: string; thumbnailUrl: string }>(`/collections/${id}/cover`, { method: 'POST', body }); },
};
