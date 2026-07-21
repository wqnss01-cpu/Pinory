import { describe, expect, it } from 'vitest';
import { canView, EntryTypeSchema, popularityScore } from './index.js';

describe('visibility', () => {
  it('keeps private content owner-only', () => expect(canView('PRIVATE', false, true)).toBe(false));
  it('allows followers content to a follower', () => expect(canView('FOLLOWERS', false, true)).toBe(true));
  it('always allows the owner', () => expect(canView('PRIVATE', true, false)).toBe(true));
});

describe('popularity', () => {
  it('rewards activity and decays with age', () => {
    const fresh = popularityScore({ uniqueViews: 10, opens: 8, publicEntries: 2, comments: 2, wishlists: 3, collectionAdds: 1, collectionFollows: 1, ageHours: 1 });
    const old = popularityScore({ uniqueViews: 10, opens: 8, publicEntries: 2, comments: 2, wishlists: 3, collectionAdds: 1, collectionFollows: 1, ageHours: 500 });
    expect(fresh).toBeGreaterThan(old);
  });
});


describe('story entries', () => {
  it('accepts the expiring story pin type', () => expect(EntryTypeSchema.parse('STORY')).toBe('STORY'));
});
