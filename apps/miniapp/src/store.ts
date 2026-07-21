import { create } from 'zustand';
import type { MapEntry } from '@pinory/shared';

export type Screen = 'map' | 'feed' | 'search' | 'profile';
interface State {
  screen: Screen;
  profileUserId: string | null;
  profileReturnScreen: Screen;
  selected: MapEntry | null;
  selectedCollectionId: string | null;
  addOpen: boolean;
  notificationsOpen: boolean;
  layers: string[];
  entryTypes: string[];
  mapCenter: { lat: number; lng: number };
  setScreen: (screen: Screen) => void;
  openProfile: (id: string) => void;
  closeProfile: () => void;
  select: (entry: MapEntry | null) => void;
  selectCollection: (id: string | null) => void;
  setAddOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  toggleLayer: (layer: string) => void;
  toggleType: (type: string) => void;
  setMapCenter: (center: { lat: number; lng: number }) => void;
}

export const useAppStore = create<State>((set) => ({
  screen: 'map', profileUserId: null, profileReturnScreen: 'map', selected: null, selectedCollectionId: null,
  addOpen: false, notificationsOpen: false, layers: ['mine', 'friends', 'public'], entryTypes: ['VISITED', 'WISHLIST'],
  mapCenter: JSON.parse(localStorage.getItem('pinory.mapCenter') ?? '{"lat":55.7512,"lng":37.6184}'),
  setScreen: (screen) => set({ screen, profileUserId: null, selected: null, selectedCollectionId: null }),
  openProfile: (id) => set((state) => ({ screen: 'profile', profileUserId: id, profileReturnScreen: state.screen === 'profile' ? state.profileReturnScreen : state.screen, selected: null, selectedCollectionId: null })),
  closeProfile: () => set((state) => ({ screen: state.profileReturnScreen, profileUserId: null, selected: null })),
  select: (selected) => set({ selected }),
  selectCollection: (selectedCollectionId) => set({ selectedCollectionId }),
  setAddOpen: (addOpen) => set({ addOpen }), setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
  toggleLayer: (layer) => set((state) => ({ layers: state.layers.includes(layer) ? state.layers.filter((item) => item !== layer) : [...state.layers, layer] })),
  toggleType: (type) => set((state) => ({ entryTypes: state.entryTypes.includes(type) ? state.entryTypes.filter((item) => item !== type) : [...state.entryTypes, type] })),
  setMapCenter: (mapCenter) => { localStorage.setItem('pinory.mapCenter', JSON.stringify(mapCenter)); set({ mapCenter }); },
}));
