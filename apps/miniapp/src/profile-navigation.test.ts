import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './store';

describe('profile navigation', () => {
  beforeEach(() => useAppStore.setState({ screen: 'search', profileUserId: null, profileReturnScreen: 'map' }));

  it('opens another user and returns to the previous screen', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    useAppStore.getState().openProfile(id);
    expect(useAppStore.getState()).toMatchObject({ screen: 'profile', profileUserId: id, profileReturnScreen: 'search' });
    useAppStore.getState().closeProfile();
    expect(useAppStore.getState()).toMatchObject({ screen: 'search', profileUserId: null });
  });
});
