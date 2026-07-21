import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Bell, Check, Edit3, Grid2X2, Layers3, LoaderCircle, LocateFixed, MapPinned, Plus, Settings, Sparkles, UserCheck, UserPlus, X } from 'lucide-react';
import type { User } from '@pinory/shared';
import { api, type ConnectionKind } from '../lib/api';
import { telegram } from '../lib/telegram';
import { formatPresence } from '../lib/presence';
import { t } from '../i18n/ru';
import { useAppStore } from '../store';
import { EntryCard } from '../components/EntryCard';
import { Logo } from '../components/Logo';
import { AchievementGallery } from '../components/AchievementGallery';
import { SocialConnectionsSheet } from '../components/SocialConnectionsSheet';
import { ProfileMapSheet } from '../components/ProfileMapSheet';

type ProfileTab = 'entries' | 'collections' | 'achievements';

export function ProfileScreen({ me }: { me: User }) {
  const viewedUserId = useAppStore((state) => state.profileUserId) ?? me.id;
  const closeProfile = useAppStore((state) => state.closeProfile);
  const notifications = useAppStore((state) => state.setNotificationsOpen);
  const selectCollection = useAppStore((state) => state.selectCollection);
  const openStories = useAppStore((state) => state.openStories);
  const [tab, setTab] = useState<ProfileTab>('entries');
  const [editing, setEditing] = useState(false); const [creating, setCreating] = useState(false); const [mapOpen, setMapOpen] = useState(false);
  const [connections, setConnections] = useState<ConnectionKind | null>(null);
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['user', viewedUserId], queryFn: () => api.user(viewedUserId) });
  const entries = useQuery({ queryKey: ['user-entries', viewedUserId], queryFn: () => api.userEntries(viewedUserId) });
  const collections = useQuery({ queryKey: ['user-collections', viewedUserId], queryFn: () => api.userCollections(viewedUserId), enabled: tab === 'collections' });
  const achievements = useQuery({ queryKey: ['achievements', viewedUserId], queryFn: () => api.achievements(viewedUserId), enabled: tab === 'achievements' });
  const locations = useQuery({ queryKey: ['friend-locations'], queryFn: api.friendLocations, enabled: viewedUserId !== me.id, refetchInterval: 60_000 });
  const stories = useQuery({ queryKey: ['stories', viewedUserId], queryFn: () => api.stories(viewedUserId), staleTime: 20_000, refetchInterval: 60_000 });
  const isOwn = viewedUserId === me.id;
  const user = profile.data ?? (isOwn ? me : undefined);
  const presence = locations.data?.items.find((item) => item.id === viewedUserId);
  const hasStories = Boolean(stories.data?.items.length);
  const follow = useMutation({
    mutationFn: () => user?.isFollowing ? api.unfollow(viewedUserId) : api.follow(viewedUserId),
    onSuccess: async () => { telegram.haptic('success'); await Promise.all([queryClient.invalidateQueries({ queryKey: ['user'] }), queryClient.invalidateQueries({ queryKey: ['connections'] }), queryClient.invalidateQueries({ queryKey: ['friend-locations'] })]); },
  });
  const invite = async () => { const data = await api.invite(); const link = await api.telegramShareLink(data.start_parameter); telegram.share(link.url, t.inviteCta); };

  if (!user) return <section className="page profile-page"><div className="connection-loading"><LoaderCircle className="spin" />Открываем профиль…</div></section>;
  return <section className="page profile-page">
    <header className="page-header">{isOwn ? <Logo /> : <div className="profile-header-title"><button className="icon-button profile-back" onClick={closeProfile}><ArrowLeft /></button><Logo /></div>}<div>{isOwn && <button className="icon-button" onClick={() => notifications(true)}><Bell /></button>}{isOwn && <button className="icon-button" onClick={() => setEditing(true)}><Settings /></button>}</div></header>
    <div className="profile-hero"><button type="button" className={`profile-orbit ${hasStories ? 'has-story' : ''}`} disabled={!hasStories} onClick={() => hasStories && openStories(viewedUserId)} aria-label={hasStories ? `Открыть сторис ${user.displayName}` : undefined}><i /><span>{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName[0]}</span><b><MapPinned /></b>{hasStories && <small className="story-orbit-label">Сторис</small>}</button><div><span className="eyebrow">{isOwn ? t.profile.myAtlas : user.isFriend ? 'ВАШ ДРУГ' : 'ПРОФИЛЬ PINORY'}</span><h1>{user.displayName}</h1><p>{[user.telegramUsername ? `@${user.telegramUsername}` : null, user.homeCity].filter(Boolean).join(' · ') || 'Исследователь мест'}</p>{presence && <span className={`profile-status-line ${presence.isLive ? 'live' : ''}`}><i />{formatPresence(presence.recordedAt, presence.isLive)}</span>}</div></div>
    <p className={`profile-bio ${user.bio ? '' : 'empty-bio'}`}>{user.bio ?? (isOwn ? 'Добавьте пару слов о себе и своих путешествиях.' : 'Пользователь пока ничего о себе не рассказал.')}</p>
    <div className={`profile-actions ${isOwn ? 'three' : 'two'}` }>{isOwn ? <button className="primary" onClick={() => setEditing(true)}><Edit3 />{t.profile.edit}</button> : <button className={`primary follow-profile ${user.isFollowing ? 'following' : ''}`} disabled={follow.isPending} onClick={() => follow.mutate()}>{follow.isPending ? <LoaderCircle className="spin" /> : user.isFollowing ? <UserCheck /> : <UserPlus />}{user.isFollowing ? 'Вы подписаны' : 'Подписаться'}</button>}{isOwn && <button onClick={invite}><UserPlus /><span className="secondary-label">{t.profile.invite}</span></button>}<button className="map-action" onClick={() => setMapOpen(true)} aria-label="Открыть личную карту"><MapPinned /></button></div>
    {isOwn && <LocationSharingCard />}
    <div className="profile-stats"><button onClick={() => setMapOpen(true)}><strong>{user.stats?.visited ?? entries.data?.items.filter((item) => item.entryType === 'VISITED').length ?? 0}</strong><span>{t.profile.visited}</span></button><button onClick={() => setMapOpen(true)}><strong>{user.stats?.wishlist ?? entries.data?.items.filter((item) => item.entryType === 'WISHLIST').length ?? 0}</strong><span>{t.profile.wishlist}</span></button><button onClick={() => setTab('collections')}><strong>{user.stats?.collections ?? collections.data?.items.length ?? 0}</strong><span>{t.profile.collections}</span></button></div>
    <div className="social-stats"><button onClick={() => setConnections('followers')}><b>{user.stats?.followers ?? 0}</b>{t.profile.followers}</button><i /><button onClick={() => setConnections('friends')}><b>{user.stats?.friends ?? 0}</b>{t.profile.friends}</button><i /><button onClick={() => setConnections('following')}><b>{user.stats?.following ?? 0}</b>{t.profile.following}</button></div>
    <div className="profile-tabs"><button className={tab === 'entries' ? 'active' : ''} onClick={() => setTab('entries')}><MapPinned />Места</button><button className={tab === 'collections' ? 'active' : ''} onClick={() => setTab('collections')}><Grid2X2 />Подборки</button><button className={tab === 'achievements' ? 'active' : ''} onClick={() => setTab('achievements')}><Sparkles />Награды</button></div>
    <AnimatePresence mode="wait"><motion.div key={tab} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
      {tab === 'entries' && <div className="profile-grid">{entries.data?.items.map((entry) => <EntryCard key={entry.id} entry={entry} />)}{entries.data?.items.length === 0 && <div className="profile-empty"><MapPinned /><p>{isOwn ? 'Ваши места появятся здесь.' : 'Доступных мест пока нет.'}</p></div>}</div>}
      {tab === 'collections' && <div className="collection-grid">{isOwn && <button className="new-collection" onClick={() => setCreating(true)}><Plus /><span>{t.profile.newCollection}</span></button>}{collections.data?.items.map((collection) => <button className="collection-card" key={collection.id} onClick={() => selectCollection(collection.id)}><div>{collection.coverUrl ? <img src={collection.coverUrl} alt="" loading="lazy" /> : <Layers3 />}<i /></div><h3>{collection.title}</h3><p>{collection.placesCount} мест</p></button>)}{!isOwn && collections.data?.items.length === 0 && <div className="profile-empty"><Layers3 /><p>Доступных подборок пока нет.</p></div>}</div>}
      {tab === 'achievements' && (achievements.data ? <AchievementGallery data={achievements.data} isOwn={isOwn} /> : <div className="connection-loading"><LoaderCircle className="spin" />Считаем достижения…</div>)}
    </motion.div></AnimatePresence>
    <AnimatePresence>{editing && <EditProfile user={user} close={() => setEditing(false)} />}{creating && <CreateCollection close={() => setCreating(false)} />}{connections && <SocialConnectionsSheet user={user} initialKind={connections} close={() => setConnections(null)} />}{mapOpen && <ProfileMapSheet user={user} entries={entries.data?.items ?? []} close={() => setMapOpen(false)} />}</AnimatePresence>
  </section>;
}

function LocationSharingCard() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['location-status'], queryFn: api.locationStatus });
  const mutation = useMutation({
    mutationFn: async () => { if (status.data?.enabled) return api.disableLocation(); const position = await telegram.location(); return api.updateLocation(position); },
    onSuccess: async () => { telegram.haptic('success'); await Promise.all([queryClient.invalidateQueries({ queryKey: ['location-status'] }), queryClient.invalidateQueries({ queryKey: ['friend-locations'] })]); },
  });
  const enabled = Boolean(status.data?.enabled);
  return <div className="presence-card"><span className="presence-symbol"><LocateFixed /><i /></span><span><strong>{enabled ? 'Вы видны друзьям' : 'Гуляете? Покажитесь друзьям'}</strong><small>Только взаимные друзья. После закрытия Pinory отслеживание остановится, а последняя точка исчезнет через 24 часа.</small></span><button className={enabled ? 'on' : ''} disabled={mutation.isPending || status.isLoading} onClick={() => mutation.mutate()}>{mutation.isPending ? '…' : enabled ? 'Выключить' : 'Включить'}</button></div>;
}

function Sheet({ children }: { children: React.ReactNode }) { return <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="bottom-sheet compact" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}><div className="sheet-handle" />{children}</motion.section></motion.div>; }
function EditProfile({ user, close }: { user: User; close: () => void }) { const [name, setName] = useState(user.displayName); const [bio, setBio] = useState(user.bio ?? ''); const [city, setCity] = useState(user.homeCity ?? ''); const queryClient = useQueryClient(); const mutation = useMutation({ mutationFn: () => api.updateMe({ displayName: name, bio, homeCity: city }), onSuccess: async (data) => { queryClient.setQueryData(['me'], data); await queryClient.invalidateQueries({ queryKey: ['user'] }); close(); } }); return <Sheet><header className="sheet-header"><h2>{t.profile.edit}</h2><button className="icon-button" onClick={close}><X /></button></header><label className="field"><span>Имя</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field"><span>О себе</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} /></label><label className="field"><span>Город</span><input value={city} onChange={(event) => setCity(event.target.value)} /></label><button className="primary full" disabled={mutation.isPending} onClick={() => mutation.mutate()}><Check />Сохранить</button></Sheet>; }
function CreateCollection({ close }: { close: () => void }) { const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const queryClient = useQueryClient(); const selectCollection = useAppStore((state) => state.selectCollection); const mutation = useMutation({ mutationFn: () => api.createCollection({ title, description, visibility: 'PUBLIC', entryIds: [] }), onSuccess: (collection) => { void queryClient.invalidateQueries({ queryKey: ['user-collections'] }); close(); selectCollection(collection.id); } }); return <Sheet><header className="sheet-header"><h2>{t.profile.newCollection}</h2><button className="icon-button" onClick={close}><X /></button></header><label className="field"><span>Название</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, выходные без плана" /></label><label className="field"><span>Описание</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><button disabled={title.trim().length < 2 || mutation.isPending} className="primary full" onClick={() => mutation.mutate()}><Plus />Создать подборку</button></Sheet>; }
