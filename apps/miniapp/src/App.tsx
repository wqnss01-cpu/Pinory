import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Map, Compass, Plus, Search, UserRound, WifiOff, Send } from 'lucide-react';
import type { User } from '@pinory/shared';
import { api, authenticate } from './lib/api';
import { telegram } from './lib/telegram';
import { t } from './i18n/ru';
import { useAppStore, type Screen } from './store';
import { Logo } from './components/Logo';
import { LocationPresenceTracker } from './components/LocationPresenceTracker';
import './stories.css';

const Onboarding = lazy(() => import('./components/Onboarding').then((module) => ({ default: module.Onboarding })));
const MapScreen = lazy(() => import('./screens/MapScreen').then((module) => ({ default: module.MapScreen })));
const FeedScreen = lazy(() => import('./screens/FeedScreen').then((module) => ({ default: module.FeedScreen })));
const SearchScreen = lazy(() => import('./screens/SearchScreen').then((module) => ({ default: module.SearchScreen })));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen').then((module) => ({ default: module.ProfileScreen })));
const AddEntrySheet = lazy(() => import('./components/AddEntrySheet').then((module) => ({ default: module.AddEntrySheet })));
const EntrySheet = lazy(() => import('./components/EntrySheet').then((module) => ({ default: module.EntrySheet })));
const CollectionSheet = lazy(() => import('./components/CollectionSheet').then((module) => ({ default: module.CollectionSheet })));
const NotificationsSheet = lazy(() => import('./components/NotificationsSheet').then((module) => ({ default: module.NotificationsSheet })));
const StoryViewer = lazy(() => import('./components/StoryViewer').then((module) => ({ default: module.StoryViewer })));

async function bootstrap() { const referral = telegram.startParam?.startsWith('ref_') || new URLSearchParams(location.search).has('ref'); if (referral) return authenticate(); try { return await api.me(); } catch { return authenticate(); } }
const Loader = () => <div className="screen-loader"><i /></div>;

export function App() {
  const queryClient = useQueryClient();
  const screen = useAppStore((state) => state.screen);
  const selected = useAppStore((state) => state.selected);
  const collectionId = useAppStore((state) => state.selectedCollectionId);
  const addOpen = useAppStore((state) => state.addOpen);
  const notificationsOpen = useAppStore((state) => state.notificationsOpen);
  const storyUserId = useAppStore((state) => state.storyUserId);
  const storyEntryId = useAppStore((state) => state.storyEntryId);
  const selectEntry = useAppStore((state) => state.select);
  const openedEntry = useRef(false);
  const [online, setOnline] = useState(navigator.onLine);
  const auth = useQuery({ queryKey: ['me'], queryFn: bootstrap, retry: 1 });

  useEffect(() => {
    telegram.ready();
    const applyTheme = (theme: 'light' | 'dark') => { document.documentElement.dataset.theme = theme; };
    applyTheme(telegram.theme);
    const unsubscribeTheme = telegram.onThemeChange(applyTheme);
    const on = () => setOnline(true); const off = () => setOnline(false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { unsubscribeTheme(); removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!auth.data?.isOnboardingCompleted || openedEntry.current) return;
    const entryId = new URLSearchParams(location.search).get('entry');
    if (!entryId || !/^[0-9a-f-]{36}$/i.test(entryId)) return;
    openedEntry.current = true;
    void api.entry(entryId).then(selectEntry).catch(() => undefined);
  }, [auth.data?.isOnboardingCompleted, selectEntry]);

  if (auth.isLoading) return <div className="splash"><Logo large /><div className="splash-orbit"><i /><i /><i /></div><p>{t.loading}</p></div>;
  if (auth.isError || !auth.data) return <div className="error-page"><Logo /><div className="telegram-gate"><Send /></div><h1>Откройте Pinory в Telegram</h1><p>Для входа нужна защищённая сессия Telegram Mini App.</p><button className="primary" onClick={() => auth.refetch()}>{t.retry}</button></div>;
  if (!auth.data.isOnboardingCompleted) return <Suspense fallback={<Loader />}><Onboarding onDone={async () => { const user = await api.updateMe({ isOnboardingCompleted: true }); queryClient.setQueryData(['me'], user); }} /></Suspense>;

  return <div className="app-shell"><LocationPresenceTracker />{!online && <div className="offline"><WifiOff size={15} />{t.offline}</div>}<main className="screen-stage"><Suspense fallback={<Loader />}><AnimatePresence mode="wait" initial={false}><motion.div className="screen-motion" key={screen} initial={{ opacity: 0, y: 8, scale: .995 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .22, ease: [.2, .8, .2, 1] }}>{screen === 'map' && <MapScreen />}{screen === 'feed' && <FeedScreen />}{screen === 'search' && <SearchScreen />}{screen === 'profile' && <ProfileScreen me={auth.data as User} />}</motion.div></AnimatePresence></Suspense></main><BottomNav screen={screen} /><Suspense fallback={null}><AnimatePresence>{addOpen && <AddEntrySheet />}{selected && <EntrySheet entry={selected} />}{collectionId && <CollectionSheet id={collectionId} />}{notificationsOpen && <NotificationsSheet />}{storyUserId && <StoryViewer userId={storyUserId} initialEntryId={storyEntryId} />}</AnimatePresence></Suspense></div>;
}

function BottomNav({ screen }: { screen: Screen }) {
  const setScreen = useAppStore((state) => state.setScreen); const setAddOpen = useAppStore((state) => state.setAddOpen);
  const items = [['map', Map, t.nav.map], ['feed', Compass, t.nav.feed], ['add', Plus, t.nav.add], ['search', Search, t.nav.search], ['profile', UserRound, t.nav.profile]] as const;
  return <nav className="bottom-nav" aria-label="Основная навигация">{items.map(([id, Icon, label]) => id === 'add' ? <motion.button whileTap={{ scale: .9 }} key={id} className="nav-add" onClick={() => { telegram.haptic('medium'); setAddOpen(true); }} aria-label={label}><span><Icon size={27} /></span><small>{label}</small></motion.button> : <motion.button whileTap={{ scale: .9 }} key={id} className={screen === id ? 'active' : ''} onClick={() => { telegram.haptic(); setScreen(id); }}><Icon size={21} /><small>{label}</small></motion.button>)}</nav>;
}
