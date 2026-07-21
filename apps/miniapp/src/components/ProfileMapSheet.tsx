import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { motion } from 'motion/react';
import { ArrowLeft, MapPinned } from 'lucide-react';
import type { MapEntry, User } from '@pinory/shared';
import { pinoryMapStyle } from '../lib/mapStyle';
import { useAppStore } from '../store';

export function ProfileMapSheet({ user, entries, close }: { user: User; entries: MapEntry[]; close: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const select = useAppStore((state) => state.select);
  useEffect(() => {
    if (!container.current) return;
    const first = entries[0]?.place.coordinates ?? { lat: 55.7512, lng: 37.6184 };
    const map: MapLibreMap = new maplibregl.Map({ container: container.current, style: pinoryMapStyle, center: [first.lng, first.lat], zoom: entries.length ? 11 : 3, attributionControl: false });
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on('load', () => {
      map.addSource('profile-entries', { type: 'geojson', data: {
        type: 'FeatureCollection',
        features: entries.map((entry) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [entry.place.coordinates.lng, entry.place.coordinates.lat] }, properties: { id: entry.id, entryType: entry.entryType } })),
      } });
      map.addLayer({ id: 'profile-halo', type: 'circle', source: 'profile-entries', paint: { 'circle-radius': 22, 'circle-color': ['case', ['==', ['get', 'entryType'], 'VISITED'], 'rgba(239,108,86,.24)', 'rgba(22,154,143,.24)'], 'circle-blur': .25 } });
      map.addLayer({ id: 'profile-points', type: 'circle', source: 'profile-entries', paint: { 'circle-radius': 12, 'circle-color': ['case', ['==', ['get', 'entryType'], 'VISITED'], '#ef6c56', '#169a8f'], 'circle-stroke-width': 4, 'circle-stroke-color': '#fffdf8' } });
      if (entries.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        entries.forEach((entry) => bounds.extend([entry.place.coordinates.lng, entry.place.coordinates.lat]));
        map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 0 });
      }
    });
    map.on('click', 'profile-points', (event) => {
      const id = event.features?.[0]?.properties?.id;
      const entry = entries.find((item) => item.id === id);
      if (entry) { close(); select(entry); }
    });
    return () => map.remove();
  }, [close, entries, select]);
  return <motion.div className="profile-map-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="profile-map-canvas" ref={container} />
    <div className="profile-map-shade" />
    <header><button className="glass-button" onClick={close}><ArrowLeft />Назад</button><div><span className="eyebrow">ЛИЧНАЯ КАРТА</span><strong>{user.displayName}</strong><small>{entries.length} сохранённых мест</small></div></header>
    {!entries.length && <div className="profile-map-empty"><MapPinned /><strong>Карта пока пустая</strong><span>Здесь появятся доступные вам места.</span></div>}
  </motion.div>;
}
