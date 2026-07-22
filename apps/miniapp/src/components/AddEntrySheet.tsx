import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { X, MapPin, Bookmark, Camera, ChevronDown, Lock, Users, Globe2, Check, Search, MapPinned, LocateFixed, LoaderCircle, Film, Clock3, BadgeCheck } from 'lucide-react';
import type { CreateEntryInput, Coordinates, EntryType, Visibility } from '@pinory/shared';
import { markerCatalog } from '@pinory/config';
import { api, type GeocodeResult } from '../lib/api';
import { telegram } from '../lib/telegram';
import { t } from '../i18n/ru';
import { useAppStore } from '../store';
import { PlaceIcon } from './PlaceIcon';
import { CoordinatePicker } from './CoordinatePicker';

type EntryForm = {
  entryType: EntryType;
  description?: string;
  visitDate?: string;
  visibility: Visibility;
  markerIconCode: string;
  commentsEnabled: boolean;
  categoryCode: string;
};

export function AddEntrySheet() {
  const close = useAppStore((state) => state.setAddOpen);
  const center = useAppStore((state) => state.mapCenter);
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<FileList | null>(null);
  const [done, setDone] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [debouncedAddress, setDebouncedAddress] = useState('');
  const [showAddresses, setShowAddresses] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<GeocodeResult | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const { register, watch, setValue, handleSubmit } = useForm<EntryForm>({
    defaultValues: { entryType: 'VISITED', description: '', visibility: 'FOLLOWERS', markerIconCode: 'nature', commentsEnabled: true, categoryCode: 'nature' },
  });
  const type = watch('entryType');
  const visibility = watch('visibility');
  const icon = watch('markerIconCode');
  const coordinates = selectedPlace?.coordinates ?? center;

  const chooseType = (next: EntryType) => {
    setValue('entryType', next);
    setStoryError(null);
    if (next === 'STORY') setValue('commentsEnabled', false);
  };

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedAddress(addressQuery.trim()), 350);
    return () => clearTimeout(timeout);
  }, [addressQuery]);

  const geocode = useQuery({
    queryKey: ['geocode', debouncedAddress],
    queryFn: () => api.geocode(debouncedAddress),
    enabled: debouncedAddress.length >= 3 && showAddresses,
    retry: 1,
  });

  const chooseAddress = (result: GeocodeResult) => {
    setSelectedPlace(result);
    setAddressQuery(result.name);
    setValue('categoryCode', result.categoryCode);
    setValue('markerIconCode', result.categoryCode);
    setLocationError(null);
    setLocationWarning(null);
    setShowAddresses(false);
    telegram.haptic('success');
  };

  const useCoordinateFallback = (point: Coordinates) => {
    const typedName = addressQuery.trim();
    const name = typedName.length >= 2 ? typedName.slice(0, 120) : 'Точка на карте';
    setSelectedPlace({ id: `coordinate-${point.lat}-${point.lng}`, name, address: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`, city: null, region: null, countryName: null, countryCode: null, categoryCode: watch('categoryCode'), coordinates: point });
    setAddressQuery(name);
    setShowAddresses(false);
    setLocationWarning('Точка подтверждена. Город и страну Pinory уточнит автоматически при публикации или позже в профиле.');
  };

  const resolvePoint = async (point: Coordinates) => {
    setPickerOpen(false);
    setResolvingLocation(true);
    setLocationError(null);
    setLocationWarning(null);
    try {
      const { item } = await api.reverseGeocode(point);
      chooseAddress({ ...item, coordinates: point });
    } catch {
      useCoordinateFallback(point);
      telegram.haptic('success');
    } finally {
      setResolvingLocation(false);
    }
  };

  const locate = async () => {
    setResolvingLocation(true);
    setLocationError(null);
    try {
      const point = await telegram.location();
      await resolvePoint({ lat: point.lat, lng: point.lng });
    } catch (error) {
      setSelectedPlace(null);
      setLocationError(error instanceof Error ? error.message : 'Не удалось получить местоположение. Проверьте разрешение геолокации.');
      telegram.haptic('error');
    } finally {
      setResolvingLocation(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: CreateEntryInput) => {
      const entry = await api.createEntry(data);
      try {
        if (files?.length) await api.upload(entry.id, files);
        return data.entryType === 'STORY' ? await api.entry(entry.id) : entry;
      } catch (error) {
        if (data.entryType === 'STORY') await api.deleteEntry(entry.id).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: async () => {
      telegram.haptic('success');
      setDone(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['map'] }),
        queryClient.invalidateQueries({ queryKey: ['user-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['stories'] }),
        queryClient.invalidateQueries({ queryKey: ['atlas-summary'] }),
      ]);
      setTimeout(() => close(false), 850);
    },
  });

  const onSubmit = handleSubmit((data) => {
    if (!selectedPlace) {
      setLocationError('Подтвердите место: выберите адрес из списка или поставьте точку на карте.');
      addressRef.current?.focus();
      telegram.haptic('error');
      return;
    }
    if (data.entryType === 'STORY' && !files?.length) {
      setStoryError('Для сторис обязательно выберите хотя бы одну фотографию.');
      return;
    }
    const name = selectedPlace.name.trim();
    setStoryError(null);
    setLocationError(null);
    mutation.mutate({
      entryType: data.entryType,
      title: name,
      visitDate: data.entryType === 'VISITED' ? data.visitDate || undefined : undefined,
      description: data.description?.trim() || undefined,
      visibility: data.visibility,
      markerIconCode: data.markerIconCode,
      commentsEnabled: data.entryType !== 'STORY' && data.commentsEnabled,
      collectionIds: [],
      place: {
        name,
        categoryCode: data.categoryCode,
        coordinates: selectedPlace.coordinates,
        address: selectedPlace.address,
        city: selectedPlace.city ?? undefined,
        region: selectedPlace.region ?? undefined,
        countryName: selectedPlace.countryName ?? undefined,
        countryCode: selectedPlace.countryCode ?? undefined,
      },
    });
  });

  const geography = selectedPlace ? [selectedPlace.city, selectedPlace.region, selectedPlace.countryName].filter(Boolean).join(' · ') : null;

  return <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) close(false); }}>
    <motion.section className="bottom-sheet add-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
      <div className="sheet-handle" />
      <header className="sheet-header"><div><span className="eyebrow">НОВОЕ МЕСТО</span><h2>{t.add.title}</h2><p>{t.add.subtitle}</p></div><button className="icon-button" type="button" onClick={() => close(false)} aria-label="Закрыть"><X /></button></header>
      {done ? <motion.div className="save-success" initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }}><span><Check /></span><h3>{type === 'STORY' ? 'Сторис на карте!' : t.add.success}</h3></motion.div> : <form onSubmit={onSubmit} noValidate>
        <div className="segmented large story-types"><button type="button" className={type === 'VISITED' ? 'active coral' : ''} onClick={() => chooseType('VISITED')}><MapPin />{t.add.visited}</button><button type="button" className={type === 'WISHLIST' ? 'active teal' : ''} onClick={() => chooseType('WISHLIST')}><Bookmark />{t.add.wishlist}</button><button type="button" className={type === 'STORY' ? 'active story' : ''} onClick={() => chooseType('STORY')}><Film />Сторис</button></div>
        {type === 'STORY' && <motion.div className="story-expiry-note" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}><Clock3 /><span>Фотосторис появится на карте и исчезнет через 24 часа.</span></motion.div>}
        <div className="address-composer">
          <label className={`field address-field ${locationError ? 'invalid' : ''}`}><span>Место или адрес</span><div><Search /><input ref={addressRef} value={addressQuery} onChange={(event) => { setAddressQuery(event.target.value); setSelectedPlace(null); setLocationError(null); setLocationWarning(null); setShowAddresses(true); }} onFocus={() => setShowAddresses(true)} autoComplete="off" placeholder="Начните вводить адрес" />{(geocode.isFetching || resolvingLocation) && <LoaderCircle className="spin" />}</div></label>
          <AnimatePresence>{showAddresses && debouncedAddress.length >= 3 && <motion.div className="address-results" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>{geocode.data?.items.map((result) => <button type="button" key={result.id} onClick={() => chooseAddress(result)}><span><PlaceIcon code={result.categoryCode} /></span><div><strong>{result.name}</strong><small>{result.address}</small></div></button>)}{geocode.isError && <p>{geocode.error.message}</p>}{!geocode.isFetching && !geocode.isError && geocode.data?.items.length === 0 && <p>Адрес не найден — выберите точку на карте.</p>}</motion.div>}</AnimatePresence>
        </div>
        <div className="location-actions"><button type="button" onClick={() => setPickerOpen(true)} disabled={resolvingLocation}><MapPinned /><span><strong>Выбрать на карте</strong><small>Поставить точку точно</small></span></button><button type="button" onClick={locate} disabled={resolvingLocation}>{resolvingLocation ? <LoaderCircle className="spin" /> : <LocateFixed />}<span><strong>Я сейчас здесь</strong><small>Взять геопозицию</small></span></button></div>
        {selectedPlace ? <motion.div className="chosen-location verified" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}><BadgeCheck /><span><strong>{selectedPlace.address}</strong><small>{geography || 'Вне границ населённого пункта'} · {selectedPlace.coordinates.lat.toFixed(5)}, {selectedPlace.coordinates.lng.toFixed(5)}</small></span><button type="button" onClick={() => setPickerOpen(true)}>Изменить</button></motion.div> : <div className="chosen-location pending"><MapPin /><span><strong>Место ещё не подтверждено</strong><small>Выберите вариант из поиска или точку на карте</small></span></div>}
        {locationError && <motion.div className="form-error location-validation" initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>{locationError}</motion.div>}
        {locationWarning && <motion.div className="location-warning" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{locationWarning}</motion.div>}
        <div className="field-row"><label className="field"><span>Категория</span><select {...register('categoryCode')}>{markerCatalog.map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select><ChevronDown /></label>{type === 'VISITED' && <label className="field"><span>{t.add.date}</span><input type="date" {...register('visitDate')} max={new Date().toISOString().slice(0, 10)} /></label>}</div>
        <label className="field"><span>{type === 'STORY' ? 'Подпись к сторис' : t.add.story}</span><textarea {...register('description')} placeholder={type === 'STORY' ? 'Что происходит в этом месте?' : t.add.storyPlaceholder} rows={3} /></label>
        <div className="form-block"><span className="label">{t.add.visibility}</span><div className="segmented visibility"><button type="button" className={visibility === 'PRIVATE' ? 'active' : ''} onClick={() => setValue('visibility', 'PRIVATE')}><Lock />{t.add.private}</button><button type="button" className={visibility === 'FOLLOWERS' ? 'active' : ''} onClick={() => setValue('visibility', 'FOLLOWERS')}><Users />{t.add.followers}</button><button type="button" className={visibility === 'PUBLIC' ? 'active' : ''} onClick={() => setValue('visibility', 'PUBLIC')}><Globe2 />{t.add.public}</button></div></div>
        {type !== 'STORY' && <div className="form-block icon-block"><span className="label">{t.add.icon}</span><div className="icon-scroller">{markerCatalog.map(([code, name]) => <button type="button" key={code} aria-label={name} title={name} className={icon === code ? 'selected' : ''} onClick={() => { setValue('markerIconCode', code); telegram.haptic(); }}><PlaceIcon code={code} /></button>)}</div></div>}
        <button type="button" className={`photo-drop ${type === 'STORY' ? 'story-required' : ''}`} onClick={() => fileRef.current?.click()}><Camera /><span><strong>{type === 'STORY' ? 'Фото для сторис' : t.add.photos}</strong><small>{files?.length ? `${files.length} фото выбрано` : type === 'STORY' ? 'Обязательно · до 10 фотографий' : t.add.photoHint}</small></span><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(event) => { setFiles(event.target.files); setStoryError(null); }} /></button>
        {storyError && <motion.div className="form-error" initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>{storyError}</motion.div>}
        {mutation.isError && <motion.div className="form-error" initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>{mutation.error.message}</motion.div>}
        <button className="primary full save-place" disabled={mutation.isPending || resolvingLocation || (type === 'STORY' && !files?.length)}>{mutation.isPending ? <><LoaderCircle className="spin" />Сохраняем…</> : type === 'STORY' ? 'Опубликовать сторис' : t.add.save}</button>
      </form>}
    </motion.section>
    <AnimatePresence>{pickerOpen && <CoordinatePicker initial={coordinates as Coordinates} onCancel={() => setPickerOpen(false)} onConfirm={(point) => { void resolvePoint(point); }} />}</AnimatePresence>
  </motion.div>;
}
