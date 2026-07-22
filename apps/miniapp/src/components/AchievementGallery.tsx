import { motion } from 'motion/react';
import { BookOpen, Camera, Compass, Feather, Flag, Heart, Landmark, Layers3, Map, MapPin, Mountain, Route, Shell, Sparkles, Sunset, Users, Utensils, Waves } from 'lucide-react';
import type { AchievementsResponse } from '../lib/api';

const icons = { pin: MapPin, compass: Compass, map: Map, sparkles: Sparkles, feather: Feather, camera: Camera, users: Users, layers: Layers3, route: Route, waves: Waves, sunset: Sunset, mountain: Mountain, shell: Shell, utensils: Utensils, landmark: Landmark, heart: Heart, flag: Flag, 'book-open': BookOpen };

export function AchievementGallery({ data, isOwn }: { data: AchievementsResponse; isOwn: boolean }) {
  const visible = isOwn ? data.achievements : data.achievements.filter((item) => item.unlockedAt);
  return <div className="achievement-gallery">
    <motion.div className="level-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="level-seal"><span>{data.level}</span><i /></div>
      <div><span className="eyebrow">УРОВЕНЬ ИССЛЕДОВАТЕЛЯ</span><h3>{data.levelTitle ?? levelTitle(data.level)}</h3><p>{data.totalXp} XP собрано</p></div>
      <div className="level-progress"><i style={{ width: `${Math.round(data.levelXp / data.nextLevelXp * 100)}%` }} /></div>
      <small>{data.nextLevelXp - data.levelXp} XP до следующего уровня</small>
    </motion.div>
    <div className="achievement-grid">
      {visible.map((item, index) => {
        const Icon = icons[item.icon as keyof typeof icons] ?? Sparkles;
        const unlocked = Boolean(item.unlockedAt);
        const percent = Math.round(item.progress / item.target * 100);
        return <motion.article
          className={`achievement-card ${unlocked ? 'unlocked' : 'locked'}`}
          key={item.code}
          initial={{ opacity: 0, y: 14, rotate: index % 2 ? 1.5 : -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ delay: index * .045, type: 'spring', stiffness: 260, damping: 24 }}
        >
          <div className="achievement-icon"><Icon /><span>{unlocked ? `+${item.xp}` : `${percent}%`}</span></div>
          <h3>{item.title} {item.tier && item.tier > 1 ? `· ${item.tier} ступень` : ``}</h3><p>{item.description}</p>
          <div className="achievement-progress"><i style={{ width: `${percent}%` }} /></div>
          <small>{unlocked ? 'Получено' : `${item.progress} из ${item.target}`}</small>
        </motion.article>;
      })}
    </div>
    {!visible.length && <div className="profile-empty"><Sparkles /><p>Достижения появятся после первых приключений.</p></div>}
  </div>;
}

function levelTitle(level: number) {
  if (level >= 5) return 'Легенда атласа';
  if (level >= 3) return 'Смелый первооткрыватель';
  if (level >= 2) return 'Любопытный следопыт';
  return 'Начинающий путешественник';
}
