import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Clock3, Eye, LoaderCircle, MapPin, X } from 'lucide-react';
import type { MapEntry } from '@pinory/shared';
import { api } from '../lib/api';
import { telegram } from '../lib/telegram';
import { useAppStore } from '../store';

const FRAME_DURATION = 5_500;

function timeLeft(expiresAt: string | null) {
  if (!expiresAt) return 'исчезнет через 24 часа';
  const minutes = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `ещё ${minutes} мин`;
  return `ещё ${Math.ceil(minutes / 60)} ч`;
}

export function StoryViewer({ userId, initialEntryId }: { userId: string; initialEntryId: string | null }) {
  const close = useAppStore((state) => state.closeStories);
  const focusMap = useAppStore((state) => state.focusMap);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['stories', userId], queryFn: () => api.stories(userId), staleTime: 20_000, refetchInterval: 30_000 });
  const frames = useMemo(() => (query.data?.items ?? []).flatMap((entry) => entry.media.map((photo) => ({ entry, photo }))), [query.data]);
  const [index, setIndex] = useState(0);
  const viewed = useRef(new Set<string>());
  const initialApplied = useRef(false);
  const frame = frames[index];

  useEffect(() => {
    if (initialApplied.current || frames.length === 0) return;
    initialApplied.current = true; const target = initialEntryId ? frames.findIndex((item) => item.entry.id === initialEntryId) : 0;
    if (target > 0) setIndex(target);
  }, [frames, initialEntryId]);

  useEffect(() => {
    if (!query.isLoading && frames.length === 0) close();
  }, [close, frames.length, query.isLoading]);

  useEffect(() => {
    if (!frame || viewed.current.has(frame.entry.id)) return;
    viewed.current.add(frame.entry.id);
    void api.viewEntry(frame.entry.id).then(({ viewsCount }) => {
      queryClient.setQueryData<{ items: MapEntry[] }>(['stories', userId], (current) => current ? {
        items: current.items.map((entry) => entry.id === frame.entry.id ? { ...entry, viewsCount } : entry),
      } : current);
    }).catch(() => undefined);
  }, [frame, query.data, queryClient, userId]);

  useEffect(() => {
    if (!frame) return;
    const timer = window.setTimeout(() => index < frames.length - 1 ? setIndex(index + 1) : close(), FRAME_DURATION);
    return () => window.clearTimeout(timer);
  }, [close, frame, frames.length, index]);

  const move = (direction: -1 | 1) => {
    telegram.haptic();
    const next = index + direction;
    if (next < 0) return;
    if (next >= frames.length) return close();
    setIndex(next);
  };

  return <motion.div className="story-viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    {query.isLoading && <div className="story-loader"><LoaderCircle /></div>}
    {frame && <>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.img className="story-photo" key={frame.photo.id} src={frame.photo.mediumUrl || frame.photo.originalUrl} alt={frame.entry.place.name} initial={{ opacity: 0, scale: 1.035 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .32 }} />
      </AnimatePresence>
      <div className="story-shade" />
      <div className="story-progress">{frames.map((item, itemIndex) => <i key={`${item.entry.id}-${item.photo.id}`} className={itemIndex < index ? 'complete' : itemIndex === index ? 'active' : ''}><b style={itemIndex === index ? { animationDuration: `${FRAME_DURATION}ms` } : undefined} /></i>)}</div>
      <header className="story-head">
        <span className="story-avatar">{frame.entry.author.avatarUrl ? <img src={frame.entry.author.avatarUrl} alt="" /> : frame.entry.author.displayName[0]}</span>
        <span><strong>{frame.entry.author.displayName}</strong><small><Clock3 />{timeLeft(frame.entry.expiresAt)}</small></span>
        <button onClick={close} aria-label="Закрыть сторис"><X /></button>
      </header>
      <button className="story-tap previous" aria-label="Предыдущая сторис" onClick={() => move(-1)} />
      <button className="story-tap next" aria-label="Следующая сторис" onClick={() => move(1)} />
      <footer className="story-caption">
        <div><span>СТОРИС · {frame.entry.place.city ?? frame.entry.place.countryName ?? 'PINORY'}</span><h2>{frame.entry.place.name}</h2>{frame.entry.description && <p>{frame.entry.description}</p>}</div>
        <button className="story-map-link" onClick={() => focusMap(frame.entry.place.coordinates)}><MapPin /><span><strong>Открыть историю на карте</strong><small>{frame.entry.place.address ?? 'Показать точку'}</small></span></button>
        <span className="story-views"><Eye />{frame.entry.viewsCount}</span>
      </footer>
    </>}
  </motion.div>;
}
