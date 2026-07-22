import { describe, expect, it } from 'vitest';
import { geographyFromProvider, localityFromAddress } from './geography.js';

describe('canonical geography', () => {
  it('uses the administrative city and ISO country code', () => {
    const result = geographyFromProvider({
      place_id: 1,
      lat: '43.585472',
      lon: '39.723098',
      display_name: 'Морской порт, Сочи, Краснодарский край, Россия',
      name: 'Морской порт',
      class: 'tourism',
      type: 'attraction',
      address: { city: 'Сочи', state: 'Краснодарский край', country: 'Россия', country_code: 'ru' },
    });
    expect(result.city).toBe('Сочи');
    expect(result.region).toBe('Краснодарский край');
    expect(result.countryCode).toBe('RU');
  });

  it('supports towns and villages without treating a suburb as a city', () => {
    expect(localityFromAddress({ town: 'Сортавала', suburb: 'Центр' })).toBe('Сортавала');
    expect(localityFromAddress({ village: 'Териберка', county: 'Кольский район' })).toBe('Териберка');
    expect(localityFromAddress({ suburb: 'Хамовники', county: 'Москва' })).toBeNull();
  });

  it('keeps a rural point outside any settlement unassigned to a city', () => {
    const result = geographyFromProvider({
      lat: '68.0000',
      lon: '35.0000',
      display_name: 'Мурманская область, Россия',
      address: { state: 'Мурманская область', country: 'Россия', country_code: 'ru' },
    });
    expect(result.city).toBeNull();
    expect(result.countryCode).toBe('RU');
  });
});
