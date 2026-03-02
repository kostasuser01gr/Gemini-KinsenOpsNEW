import { describe, expect, it } from 'vitest';
import { extractSessionCookie, isStepUpValid } from '../src/auth';

describe('Auth contract helpers', () => {
  it('extracts session token from cookie header', () => {
    const cookie = 'foo=bar; session=abc123; Path=/';
    expect(extractSessionCookie(cookie)).toBe('abc123');
  });

  it('returns null when session cookie is missing', () => {
    expect(extractSessionCookie('foo=bar')).toBeNull();
  });

  it('validates step-up freshness window', () => {
    const now = Date.now();
    const valid = new Date(now - 5 * 60 * 1000).toISOString();
    const expired = new Date(now - 20 * 60 * 1000).toISOString();

    expect(isStepUpValid(valid, now)).toBe(true);
    expect(isStepUpValid(expired, now)).toBe(false);
  });
});
