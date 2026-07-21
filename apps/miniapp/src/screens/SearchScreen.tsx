import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowUpRight, Layers3, LoaderCircle, MapPin, Search, UserCheck, UserPlus, Users, X } from 'lucide-react';
import type { User } from '@pinory/shared';
import { api } from '../lib/api';
import { t } from '../i18n/ru';
import { useAppStore } from '../store';
import { PlaceIcon } from '../components/PlaceIcon';
import { telegram } from '../lib/telegram';

export function SearchScreen() {
  const [raw, setRaw] = useState(''); const [query, setQuery] = useState('');
  const setScreen = useAppStore((state) => state.setScreen); const openProfile = useAppStore((state) => state.openProfile); const selectCollection = useAppStore((state) => state.selectCollection);
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  useEffect(() => { const id = setTimeout(() => setQuery(raw.trim()), 350); return () => clearTimeout(id); }, [raw]);
  const result = useQuery({ queryKey: ['search', query], queryFn: () => api.search(query), enabled: query.length > 1 });
  const empty = result.data && !result.data.places.length && !result.data.users.length && !result.data.collections.length;
  return <section className="page search-page">
    <header className="search-title"><span className="eyebrow">PINORY · ПОИСК</span><h1>{t.search.title}</h1></header>
    <label className="search-input"><Search /><input autoFocus value={raw} onChange={(event) => setRaw(event.target.value)} placeholder={t.search.placeholder} />{raw && <button aria-label="Очистить поиск" onClick={() => setRaw('')}><X /></button>}</label>
    {!query && <div className="search-hint"><div className="orbit-search"><i /><i /><span><MapPin /></span></div><p>{t.search.hint}</p><div className="suggestions"><button onClick={() => setRaw('закат')}>закат</button><button onClick={() => setRaw('Сочи')}>Сочи</button><button onClick={() => setRaw('кофе')}>кофе</button></div></div>}
    {result.isFetching && <div className="search-loading"><i /><i /><i /></div>}
    {result.data && <motion.div className="search-results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      {result.data.places.length > 0 && <ResultSection icon={<MapPin />} title={t.search.places}>{result.data.places.map((place) => <button className="result-row" key={place.id} onClick={() => setScreen('map')}><span className="result-icon"><PlaceIcon code={place.categoryCode} /></span><span><strong>{place.name}</strong><small>{[place.city, place.categoryName, `${place.entriesCount} ${t.map.publications}`].filter(Boolean).join(' · ')}</small></span><ArrowUpRight /></button>)}</ResultSection>}
      {result.data.users.length > 0 && <ResultSection icon={<Users />} title={t.search.people}>{result.data.users.map((user) => <div className="result-row user-result-row interactive" role="button" tabIndex={0} key={user.id} onClick={() => openProfile(user.id)} onKeyDown={(event) => { if (event.key === 'Enter') openProfile(user.id); }}><span className="result-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName[0]}</span><span><strong>{user.displayName}</strong><small>{user.isFriend ? 'Ваш друг · открыть карту' : user.telegramUsername ? `@${user.telegramUsername}` : 'Открыть профиль'}</small></span>{user.id !== me.data?.id && <FollowUserButton user={user} />}</div>)}</ResultSection>}
      {result.data.collections.length > 0 && <ResultSection icon={<Layers3 />} title={t.search.collections}>{result.data.collections.map((collection) => <button className="result-row" key={collection.id} onClick={() => selectCollection(collection.id)}><span className="result-icon collection"><Layers3 /></span><span><strong>{collection.title}</strong><small>{collection.placesCount} мест · {collection.author.displayName}</small></span><ArrowUpRight /></button>)}</ResultSection>}
    </motion.div>}
    {empty && <div className="state-card"><MapPin /><h3>{t.search.noResults}</h3><button onClick={() => setScreen('map')}>{t.nav.map}</button></div>}
  </section>;
}

function FollowUserButton({ user }: { user: User }) {
  const queryClient = useQueryClient(); const [following, setFollowing] = useState(Boolean(user.isFollowing));
  const mutation = useMutation({ mutationFn: () => following ? api.unfollow(user.id) : api.follow(user.id), onSuccess: async () => { setFollowing(!following); telegram.haptic('success'); await Promise.all([queryClient.invalidateQueries({ queryKey: ['user'] }), queryClient.invalidateQueries({ queryKey: ['connections'] })]); } });
  return <button className={`follow-user ${following ? 'following' : ''}`} aria-label={following ? `Отписаться от ${user.displayName}` : `Подписаться на ${user.displayName}`} disabled={mutation.isPending} onClick={(event) => { event.stopPropagation(); mutation.mutate(); }}>{mutation.isPending ? <LoaderCircle className="spin" /> : following ? <UserCheck /> : <UserPlus />}<span>{following ? 'Вы подписаны' : 'Подписаться'}</span></button>;
}

function ResultSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <section className="result-section"><h2>{icon}{title}</h2>{children}</section>; }
