import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowLeft, LoaderCircle, UserCheck, UserPlus, Users } from 'lucide-react';
import type { User } from '@pinory/shared';
import { api, type ConnectionKind } from '../lib/api';
import { telegram } from '../lib/telegram';
import { useAppStore } from '../store';

const labels: Record<ConnectionKind, string> = { followers: 'Подписчики', following: 'Подписки', friends: 'Друзья' };

export function SocialConnectionsSheet({ user, initialKind, close }: { user: User; initialKind: ConnectionKind; close: () => void }) {
  const [kind, setKind] = useState(initialKind);
  const openProfile = useAppStore((state) => state.openProfile);
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const query = useQuery({ queryKey: ['connections', user.id, kind], queryFn: () => api.connections(user.id, kind) });
  return <motion.div className="social-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.section className="social-sheet" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <header><button className="icon-button" onClick={close}><ArrowLeft /></button><div><span className="eyebrow">СВЯЗИ</span><h2>{user.displayName}</h2></div></header>
      <div className="social-tabs">{(Object.keys(labels) as ConnectionKind[]).map((item) => <button key={item} className={kind === item ? 'active' : ''} onClick={() => setKind(item)}>{labels[item]}</button>)}</div>
      <div className="connection-list">
        {query.isLoading && <div className="connection-loading"><LoaderCircle className="spin" />Загружаем людей…</div>}
        {query.data?.items.map((person, index) => <motion.div className="connection-row" key={person.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .035 }} onClick={() => { openProfile(person.id); close(); }}>
          <span className="connection-avatar">{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : person.displayName[0]}</span>
          <span><strong>{person.displayName}</strong><small>{person.isFriend ? 'Взаимная подписка' : person.telegramUsername ? `@${person.telegramUsername}` : 'Профиль Pinory'}</small></span>
          {person.id !== me.data?.id && <ConnectionFollow person={person} />}
        </motion.div>)}
        {query.data?.items.length === 0 && <div className="profile-empty"><Users /><p>Здесь пока никого нет.</p></div>}
      </div>
    </motion.section>
  </motion.div>;
}

function ConnectionFollow({ person }: { person: User }) {
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(Boolean(person.isFollowing));
  const mutation = useMutation({
    mutationFn: () => following ? api.unfollow(person.id) : api.follow(person.id),
    onSuccess: async () => {
      setFollowing(!following);
      telegram.haptic('success');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['connections'] }),
        queryClient.invalidateQueries({ queryKey: ['user'] }),
      ]);
    },
  });
  return <button className={`connection-follow ${following ? 'following' : ''}`} disabled={mutation.isPending} onClick={(event) => { event.stopPropagation(); mutation.mutate(); }}>
    {mutation.isPending ? <LoaderCircle className="spin" /> : following ? <UserCheck /> : <UserPlus />}
  </button>;
}
