import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { distanceMeters } from '../lib/presence';

export function LocationPresenceTracker() {
  const status = useQuery({ queryKey: ['location-status'], queryFn: api.locationStatus, staleTime: 60_000 });
  const last = useRef<{ position: { lat: number; lng: number }; sentAt: number } | null>(null);

  useEffect(() => {
    if (!status.data?.enabled || !navigator.geolocation) return;
    let disposed = false;
    const publish = (position: GeolocationPosition) => {
      if (disposed) return;
      const current = { lat: position.coords.latitude, lng: position.coords.longitude };
      const previous = last.current;
      const elapsed = Date.now() - (previous?.sentAt ?? 0);
      const moved = previous ? distanceMeters(previous.position, current) : Number.POSITIVE_INFINITY;
      if (elapsed < 45_000 && moved < 35) return;
      last.current = { position: current, sentAt: Date.now() };
      void api.updateLocation({ ...current, accuracy: position.coords.accuracy }).catch(() => undefined);
    };
    const watchId = navigator.geolocation.watchPosition(publish, () => undefined, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 15_000,
    });
    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [status.data?.enabled]);

  return null;
}
