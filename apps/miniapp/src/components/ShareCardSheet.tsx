import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Download, LoaderCircle, Send, X } from 'lucide-react';
import type { MapEntry } from '@pinory/shared';
import { downloadEntryCard, generateEntryCard, shareGeneratedEntryCard, type GeneratedShareCard } from '../lib/share-card';
import { telegram } from '../lib/telegram';

export function ShareCardSheet({ entry, close }: { entry: MapEntry; close: () => void }) {
  const [card, setCard] = useState<GeneratedShareCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const previewUrl = useMemo(() => card ? URL.createObjectURL(card.blob) : null, [card]);

  const generate = () => {
    setError(null);
    void generateEntryCard(entry).then(setCard).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Не удалось собрать PNG-карточку');
    });
  };

  useEffect(() => { generate(); }, [entry.id]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const download = () => {
    if (!card) return;
    downloadEntryCard(card);
    setDownloaded(true);
    telegram.haptic('success');
  };

  const share = async () => {
    if (!card) return;
    setSharing(true);
    setError(null);
    try {
      await shareGeneratedEntryCard(card, entry.place.name);
      telegram.haptic('success');
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : 'Не удалось открыть меню отправки');
      telegram.haptic('error');
    } finally {
      setSharing(false);
    }
  };

  return <motion.div className="nested-sheet sheet-backdrop share-card-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.section className="bottom-sheet share-card-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 330, damping: 33 }}>
      <div className="sheet-handle" />
      <header className="sheet-header">
        <div><span className="eyebrow">КАРТОЧКА МЕСТА</span><h2>{card ? 'PNG готов' : error ? 'Нужна ещё попытка' : 'Собираем историю…'}</h2></div>
        <button className="icon-button" aria-label="Закрыть карточку" onClick={close}><X /></button>
      </header>
      {!card && !error && <div className="share-card-building"><span><LoaderCircle className="spin" /></span><b>Добавляем фото, QR-код и детали места</b><small>Обычно это занимает несколько секунд</small></div>}
      {error && !card && <div className="share-card-error"><b>{error}</b><button onClick={generate}>Попробовать ещё раз</button></div>}
      {card && previewUrl && <>
        <div className="share-card-preview"><img src={previewUrl} alt={`Карточка места ${entry.place.name}`} /><span><Check /> Готово к сохранению</span></div>
        {error && <p className="share-card-inline-error">{error}</p>}
        <div className="share-card-actions">
          <button className={downloaded ? 'downloaded' : 'primary'} onClick={download}>{downloaded ? <Check /> : <Download />}{downloaded ? 'Скачано' : 'Скачать PNG'}</button>
          <button onClick={() => void share()} disabled={sharing}>{sharing ? <LoaderCircle className="spin" /> : <Send />}Поделиться</button>
        </div>
        <p className="share-card-save-hint">Если Telegram откроет изображение вместо скачивания, удерживайте карточку и выберите «Сохранить».</p>
      </>}
    </motion.section>
  </motion.div>;
}
