import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type GeoJSONSource, type Marker } from 'maplibre-gl';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Layers3, LocateFixed, SlidersHorizontal, Search, ChevronDown, LoaderCircle, MapPin } from 'lucide-react';
import type { MapEntry } from '@pinory/shared';
import { api } from '../lib/api';
import { formatPresence } from '../lib/presence';
import { telegram } from '../lib/telegram';
import { t } from '../i18n/ru';
import { useAppStore } from '../store';
import { pinoryMapStyle } from '../lib/mapStyle';

export function MapScreen() {
  const container = useRef<HTMLDivElement>(null); const mapRef = useRef<MapLibreMap | null>(null); const locationMarkerRef = useRef<Marker | null>(null); const friendMarkersRef = useRef(new Map<string, Marker>()); const entriesRef = useRef<MapEntry[]>([]);
  const [loaded, setLoaded] = useState(false); const [bbox, setBbox] = useState('37.30,55.55,37.95,55.93'); const [tools, setTools] = useState<'layers' | 'filters' | null>(null); const [locating, setLocating] = useState(false); const [hasLocation, setHasLocation] = useState(false);
  const initialCenter = useRef(useAppStore.getState().mapCenter).current;
  const setCenter = useAppStore((state) => state.setMapCenter); const layers = useAppStore((state) => state.layers); const types = useAppStore((state) => state.entryTypes); const toggleLayer = useAppStore((state) => state.toggleLayer); const toggleType = useAppStore((state) => state.toggleType); const setScreen = useAppStore((state) => state.setScreen); const openProfile = useAppStore((state) => state.openProfile); const select = useAppStore((state) => state.select);
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const query = useQuery({ queryKey: ['map', bbox, layers.join(','), types.join(',')], queryFn: () => api.map(bbox, layers.join(','), types.join(',')), placeholderData: (old) => old });
  const friends = useQuery({ queryKey: ['friend-locations'], queryFn: api.friendLocations, enabled: layers.includes('friends'), refetchInterval: 60_000, staleTime: 30_000 });

  const showLocation = useCallback((position: { lat: number; lng: number }, fly = true) => { const map = mapRef.current; if (!map) return; if (!locationMarkerRef.current) { const element = document.createElement('div'); element.className = 'user-location-marker'; element.append(document.createElement('span')); locationMarkerRef.current = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([position.lng, position.lat]).addTo(map); } else locationMarkerRef.current.setLngLat([position.lng, position.lat]); setHasLocation(true); if (fly) map.flyTo({ center: [position.lng, position.lat], zoom: 15, duration: 1000, essential: true }); }, []);
  const locate = useCallback(async (fly = true) => { setLocating(true); try { const position = await telegram.location(); showLocation(position, fly); telegram.haptic('success'); } catch { telegram.haptic('error'); } finally { setLocating(false); } }, [showLocation]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: container.current, style: pinoryMapStyle, center: [initialCenter.lng, initialCenter.lat], zoom: 10.5, attributionControl: false });
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on('load', () => {
      map.addSource('entries', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterMaxZoom: 12, clusterRadius: 52 });
      map.addLayer({ id: 'clusters-shadow', type: 'circle', source: 'entries', filter: ['has', 'point_count'], paint: { 'circle-color': 'rgba(18,35,31,.16)', 'circle-radius': ['step', ['get', 'point_count'], 26, 10, 31, 40, 38], 'circle-blur': .45 } });
      map.addLayer({ id: 'clusters', type: 'circle', source: 'entries', filter: ['has', 'point_count'], paint: { 'circle-color': '#183c34', 'circle-radius': ['step', ['get', 'point_count'], 21, 10, 26, 40, 33], 'circle-stroke-width': 4, 'circle-stroke-color': '#fffdf7' } });
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'entries', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Open Sans Bold'], 'text-size': 13 }, paint: { 'text-color': '#fff' } });
      map.addLayer({ id: 'entry-halo', type: 'circle', source: 'entries', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 19, 'circle-color': ['case', ['==', ['get', 'entryType'], 'VISITED'], 'rgba(239,108,86,.2)', 'rgba(22,154,143,.2)'], 'circle-blur': .25 } });
      map.addLayer({ id: 'entry-points', type: 'circle', source: 'entries', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 12, 'circle-color': ['case', ['==', ['get', 'entryType'], 'VISITED'], '#ef6c56', '#169a8f'], 'circle-stroke-color': '#fffdf7', 'circle-stroke-width': 4 } });
      map.addLayer({ id: 'entry-center', type: 'circle', source: 'entries', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 3, 'circle-color': '#fffdf7' } });
      setLoaded(true);
    });
    map.on('moveend', () => { const bounds = map.getBounds(); setBbox(`${bounds.getWest().toFixed(5)},${bounds.getSouth().toFixed(5)},${bounds.getEast().toFixed(5)},${bounds.getNorth().toFixed(5)}`); const next = map.getCenter(); setCenter({ lat: next.lat, lng: next.lng }); });
    map.on('click', 'clusters', (event) => { const feature = map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0]; if (!feature) return; const id = feature.properties?.cluster_id as number; void (map.getSource('entries') as GeoJSONSource).getClusterExpansionZoom(id).then((zoom) => map.easeTo({ center: (feature.geometry as any).coordinates as [number, number], zoom, duration: 650 })); });
    map.on('click', 'entry-points', (event) => { const id = event.features?.[0]?.properties?.id; const found = entriesRef.current.find((entry) => entry.id === id); if (found) { telegram.haptic(); select(found); } });
    map.on('mouseenter', 'entry-points', () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', 'entry-points', () => { map.getCanvas().style.cursor = ''; });
    mapRef.current = map;
    return () => { locationMarkerRef.current?.remove(); locationMarkerRef.current = null; friendMarkersRef.current.forEach((marker) => marker.remove()); friendMarkersRef.current.clear(); map.remove(); mapRef.current = null; };
  }, [initialCenter, select, setCenter]);

  useEffect(() => { if (!loaded || !navigator.permissions) return; void navigator.permissions.query({ name: 'geolocation' }).then((permission) => { if (permission.state === 'granted') void locate(false); }).catch(() => undefined); }, [loaded, locate]);
  const geojson = useMemo(() => ({ type: 'FeatureCollection' as const, features: (query.data?.items ?? []).map((entry) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [entry.place.coordinates.lng, entry.place.coordinates.lat] }, properties: { id: entry.id, entryType: entry.entryType } })) }), [query.data]);
  useEffect(() => { entriesRef.current = query.data?.items ?? []; if (loaded) (mapRef.current?.getSource('entries') as GeoJSONSource | undefined)?.setData(geojson); }, [loaded, geojson, query.data]);

  useEffect(() => {
    const map = mapRef.current; if (!loaded || !map) return;
    const active = new Set<string>();
    for (const friend of friends.data?.items ?? []) {
      active.add(friend.id); let marker = friendMarkersRef.current.get(friend.id);
      if (!marker) {
        const element = document.createElement('button'); element.type = 'button'; element.className = 'friend-presence-marker'; element.setAttribute('aria-label', `Открыть профиль ${friend.displayName}`);
        if (friend.avatarUrl) { const image = document.createElement('img'); image.src = friend.avatarUrl; image.alt = ''; element.append(image); } else element.append(document.createTextNode(friend.displayName[0] ?? 'P'));
        element.append(document.createElement('i'), document.createElement('small')); element.addEventListener('click', () => openProfile(friend.id));
        marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([friend.coordinates.lng, friend.coordinates.lat]).addTo(map); friendMarkersRef.current.set(friend.id, marker);
      }
      marker.setLngLat([friend.coordinates.lng, friend.coordinates.lat]); const element = marker.getElement(); element.classList.toggle('live', friend.isLive); const label = element.querySelector('small'); if (label) label.textContent = formatPresence(friend.recordedAt, friend.isLive);
    }
    friendMarkersRef.current.forEach((marker, id) => { if (!active.has(id)) { marker.remove(); friendMarkersRef.current.delete(id); } });
  }, [friends.data, loaded, openProfile]);

  return <section className="map-screen"><div ref={container} className="map-canvas" /><div className="map-vignette" /><header className="map-header"><motion.button whileTap={{ scale: .97 }} className="search-pill" onClick={() => setScreen('search')}><Search size={19} /><span>{t.map.search}</span></motion.button><motion.button whileTap={{ scale: .92 }} className="avatar-button" onClick={() => setScreen('profile')}>{me.data?.avatarUrl ? <img src={me.data.avatarUrl} alt="" /> : me.data?.displayName?.[0] ?? 'P'}</motion.button></header><div className="map-tools"><button className={tools === 'layers' ? 'active' : ''} onClick={() => setTools(tools === 'layers' ? null : 'layers')}><Layers3 size={19} /><span>{t.map.layers}</span><ChevronDown size={14} /></button><button className={tools === 'filters' ? 'active' : ''} onClick={() => setTools(tools === 'filters' ? null : 'filters')}><SlidersHorizontal size={18} /><span>{t.map.filters}</span></button></div><AnimatePresence>{tools && <motion.div className="tool-popover" initial={{ opacity: 0, y: -7, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: .98 }}>{tools === 'layers' ? <>{[['mine', t.map.mine], ['friends', t.map.friends], ['public', t.map.public]].map(([id, label]) => <button key={id} className={layers.includes(id!) ? 'on' : ''} onClick={() => toggleLayer(id!)}><i />{label}</button>)}</> : <>{[['VISITED', t.map.visited], ['WISHLIST', t.map.wishlist]].map(([id, label]) => <button key={id} className={types.includes(id!) ? 'on' : ''} onClick={() => toggleType(id!)}><i />{label}</button>)}</>}</motion.div>}</AnimatePresence><motion.button whileTap={{ scale: .9 }} className={`locate-button ${hasLocation ? 'has-location' : ''}`} onClick={() => locate(true)} aria-label={t.map.locate}>{locating ? <LoaderCircle className="spin" /> : <LocateFixed />}<span>{hasLocation ? 'Вы здесь' : 'Найти меня'}</span></motion.button>{!query.isFetching && query.data?.items.length === 0 && <motion.div className="map-empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><MapPin /><strong>{layers.length ? t.map.empty : 'Выберите хотя бы один слой'}</strong></motion.div>}{query.isFetching && <div className="map-loading"><i /><span>{t.loading}</span></div>}</section>;
}
