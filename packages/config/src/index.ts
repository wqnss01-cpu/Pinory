export const brand = {
  name: 'Pinory',
  tagline: 'Места, к которым хочется вернуться',
  shortTagline: 'Твой живой атлас',
  colors: { ink: '#153b34', paper: '#f1eee7', coral: '#ef6c56', lagoon: '#169a8f', sun: '#edc968', plum: '#704d67' }
} as const;

export const markerCatalog = [
  ['nature', 'Природа', 'nature'], ['waterfall', 'Водопады', 'waterfall'], ['mountain', 'Горы', 'mountain'], ['beach', 'Пляжи', 'beach'],
  ['lake', 'Озёра', 'lake'], ['forest', 'Лес', 'forest'], ['park', 'Парки', 'park'], ['restaurant', 'Рестораны', 'restaurant'],
  ['cafe', 'Кафе', 'cafe'], ['bar', 'Бары', 'bar'], ['hotel', 'Отели', 'hotel'], ['museum', 'Музеи', 'museum'],
  ['architecture', 'Архитектура', 'architecture'], ['history', 'История', 'history'], ['fun', 'Развлечения', 'fun'], ['sport', 'Спорт', 'sport'],
  ['event', 'События', 'event'], ['shopping', 'Покупки', 'shopping'], ['transport', 'Транспорт', 'transport'], ['viewpoint', 'Смотровые', 'viewpoint'],
  ['photo', 'Фотографии', 'photo'], ['romantic', 'Романтика', 'romantic'], ['family', 'Семейные', 'family'], ['favorite', 'Избранное', 'favorite'], ['other', 'Другое', 'other']
] as const;
