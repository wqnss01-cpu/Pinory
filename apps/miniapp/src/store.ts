import { create } from 'zustand';
import type { MapEntry } from '@pinory/shared';

export type Screen = 'map' | 'feed' | 'search' | 'profile';
type MapPoint = { lat: number; lng: number };
interface State {
  screen: Screen;
  profileUserId: string | null;
  profileReturnScreen: Screen;
  selected: MapEntry | null;
  selectedCollectionId: string | null;
  storyUserId: string | null;
  storyEntryId: string | null;
  addOpen: boolean;
  notificationsOpen: boolean;
  layers: string[];
  entryTypes: string[];
  mapCenter: MapPoint;
  mapFocus: (MapPoint & { key: number }) | null;
  setScreen: (screen: Screen) => void;
  openProfile: (id: string) => void;
  closeProfile: () => void;
  select: (entry: MapEntry | null) => void;
  selectCollection: (id: string | null) => void;
  openStories: (userId: string, entryId?: string) => void;
  closeStories: () => void;
  focusMap: (center: MapPoint) => void;
  clearMapFocus: () => void;
  setAddOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  toggleLayer: (layer: string) => void;
  toggleType: (type: string) => void;
  setMapCenter: (center: MapPoint) => void;
}

export const useAppStore = create<State>((set) => ({
  screen: 'map', profileUserId: null, profileReturnScreen: 'map', selected: null, selectedCollectionId: null, storyUserId: null, storyEntryId: null,
  addOpen: false, notificationsOpen: false, layers: ['mine', 'friends', 'public'], entryTypes: ['VISITED', 'WISHLIST'],
  mapCenter: JSON.parse(localStorage.getItem('pinory.mapCenter') ?? '{"lat":55.7512,"lng":37.6184}'), mapFocus: null,
  setScreen: (screen) => set({ screen, profileUserId: null, selected: null, selectedCollectionId: null }),
  openProfile: (id) => set((state) => ({ screen: 'profile', profileUserId: id, profileReturnScreen: state.screen === 'profile' ? state.profileReturnScreen : state.screen, selected: null, selectedCollectionId: null })),
  closeProfile: () => set((state) => ({ screen: state.profileReturnScreen, profileUserId: null, selected: null })),
  select: (selected) => set({ selected }),
  selectCollection: (selectedCollectionId) => set({ selectedCollectionId }),
  openStories: (storyUserId, storyEntryId) => set({ storyUserId, storyEntryId: storyEntryId ?? null, selected: null, selectedCollectionId: null }),
  closeStories: () => set({ storyUserId: null, storyEntryId: null }),
  focusMap: (mapCenter) => { localStorage.setItem('pinory.mapCenter', JSON.stringify(mapCenter)); set({ screen: 'map', profileUserId: null, storyUserId: null, storyEntryId: null, selected: null, mapCenter, mapFocus: { ...mapCenter, key: Date.now() } }); },
  clearMapFocus: () => set({ mapFocus: null }),
  setAddOpen: (addOpen) => set({ addOpen }), setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
  toggleLayer: (layer) => set((state) => ({ layers: state.layers.includes(layer) ? state.layers.filter((item) => item !== layer) : [...state.layers, layer] })),
  toggleType: (type) => set((state) => ({ entryTypes: state.entryTypes.includes(type) ? state.entryTypes.filter((item) => item !== type) : [...state.entryTypes, type] })),
  setMapCenter: (mapCenter) => { localStorage.setItem('pinory.mapCenter', JSON.stringify(mapCenter)); set({ mapCenter }); },
}));
