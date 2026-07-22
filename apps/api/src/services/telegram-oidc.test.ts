import { describe, expect, it } from 'vitest';
import { pkceChallenge, secretHash } from './telegram-oidc.js';

describe('Telegram OIDC helpers', () => {
  it('creates the RFC 7636 S256 challenge', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('hashes one-time secrets without storing them in plain text', () => {
    expect(secretHash('pinory')).toBe('74cac16c6696fae8358ed42b52703f657e5c07b389f7236845101bf8041ce018');
  });
});
