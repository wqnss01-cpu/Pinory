import type { AuthResponse, CreateEntryInput, MapEntry, Place, User } from '@pinory/shared';
import { telegram } from './telegram';

const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api/v1' : 'http://localhost:4000/api/v1');
let token = localStorage.getItem('pinory.access');

async function request<T>(path: string, options: RequestInit = {}) {
  const hasJsonBody = options.body !== undefined && !(options.body instanceof FormData);
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({ message: 'Сервис временно недоступен' }));
  if (!response.ok) throw new Error(data.message ?? 'Ошибка запроса');
  return data as T;
}

export async function authenticate() {
  const params = new URLSearchParams(location.search);
  const data = await request<AuthResponse>('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({
      initData: telegram.initData,
      referral: telegram.startParam ?? params.get('ref') ?? undefined,
    }),
  });
  token = data.accessToken;
  localStorage.setItem('pinory.access', token);
  localStorage.setItem('pinory.refresh', data.refreshToken);
  return data.user;
}

export interface GeocodeResult {
  id: string;
  name: string;
  address: string;
  city: string | null;
  countryName: string | null;
  categoryCode: string;
  coordinates: { lat: number; lng: number };
}

export interface CollectionSummary {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  visibility: string;
  coverUrl: string | null;
  placesCount: number;
  followersCount: number;
  isFollowing: boolean;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    telegramUsername?: string | null;
  };
}

export interface CollectionDetail extends CollectionSummary {
  entries: MapEntry[];
}

export const api = {
  me: () => request<User>('/auth/me'),
  user: (id: string) => request<User>(`/users/${id}`),
  updateMe: (data: unknown) => request<User>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  map: (bbox: string, layers: string, entryTypes: string) =>
    request<{ items: MapEntry[] }>(`/map/entries?bbox=${encodeURIComponent(bbox)}&zoom=10&layers=${encodeURIComponent(layers)}&entryTypes=${encodeURIComponent(entryTypes)}`),
  geocode: (query: string) => request<{ items: GeocodeResult[] }>(`/geocoding/search?query=${encodeURIComponent(query)}&limit=7`),
  createEntry: (data: CreateEntryInput) => request<MapEntry>('/entries', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(data) }),
  updateEntry: (id: string, data: unknown) => request<MapEntry>(`/entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEntry: (id: string) => request<void>(`/entries/${id}`, { method: 'DELETE' }),
  entry: (id: string) => request<MapEntry>(`/entries/${id}`),
  place: (id: string) => request<Place>(`/places/${id}`),
  feed: (kind: 'following' | 'nearby' | 'global') => request<{ items: MapEntry[] }>(`/feed/${kind}`),
  search: (query: string) => request<{ places: Place[]; users: User[]; collections: CollectionSummary[] }>(`/search?query=${encodeURIComponent(query)}&type=all`),
  userCollections: (id: string) => request<{ items: CollectionSummary[] }>(`/users/${id}/collections`),
  userEntries: (id: string) => request<{ items: MapEntry[] }>(`/users/${id}/entries`),
  collection: (id: string) => request<CollectionDetail>(`/collections/${id}`),
  followCollection: (id: string) => request<{ following: boolean }>(`/collections/${id}/follow`, { method: 'POST', body: '{}' }),
  unfollowCollection: async (id: string) => {
    await request<void>(`/collections/${id}/follow`, { method: 'DELETE' });
    return { following: false };
  },
  collectionToWishlist: (id: string) => request<{ created: number }>(`/collections/${id}/add-all-to-wishlist`, { method: 'POST', body: '{}' }),
  notifications: () => request<{ items: any[] }>('/notifications'),
  invite: () => request<{ start_parameter: string }>('/invitations/me'),
  follow: (id: string) => request<{ following: boolean; isFriend?: boolean }>(`/users/${id}/follow`, { method: 'POST', body: '{}' }),
  unfollow: async (id: string) => {
    await request<void>(`/users/${id}/follow`, { method: 'DELETE' });
    return { following: false };
  },
  createCollection: (data: unknown) => request<CollectionSummary>('/collections', { method: 'POST', body: JSON.stringify(data) }),
  comment: (id: string, text: string) => request(`/entries/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  comments: (id: string) => request<{ items: any[] }>(`/entries/${id}/comments`),
  upload: async (id: string, files: FileList) => {
    const body = new FormData();
    [...files].forEach((file) => body.append('photos', file));
    return request(`/entries/${id}/media`, { method: 'POST', body });
  },
  uploadCollectionCover: async (id: string, file: File) => {
    const body = new FormData();
    body.append('cover', file);
    return request<{ id: string; coverUrl: string; thumbnailUrl: string }>(`/collections/${id}/cover`, { method: 'POST', body });
  },
};
