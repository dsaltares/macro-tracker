import { describe, expect, it } from 'vitest';
import { afterAuthPath, authUrl } from './redirect.ts';

describe('afterAuthPath', () => {
  it('goes home without somewhere to go next', () => {
    expect(afterAuthPath(null)).toBe('/');
  });

  it('goes on to the page that asked for a sign-in', () => {
    expect(afterAuthPath('/diary?date=2026-10-19')).toBe(
      '/diary?date=2026-10-19',
    );
  });

  it.each([
    'https://elsewhere.example',
    '//elsewhere.example',
    '/\\elsewhere.example',
    'diary',
  ])('never leaves the app for %s', (next) => {
    expect(afterAuthPath(next)).toBe('/');
  });

  it('never goes back to an auth page', () => {
    expect(afterAuthPath('/sign-in?next=%2Fdiary')).toBe('/');
  });
});

describe('authUrl', () => {
  it('is the bare route without somewhere to go next', () => {
    expect(authUrl('/sign-in')).toBe('/sign-in');
  });

  it('carries the page to go on to', () => {
    expect(authUrl('/sign-in', '/diary')).toBe('/sign-in?next=%2Fdiary');
  });

  it('drops a page outside the app', () => {
    expect(authUrl('/sign-in', '//elsewhere.example')).toBe('/sign-in');
  });

  it('adds any other parameter before it', () => {
    expect(authUrl('/verify', '/diary', { email: 'eater@example.test' })).toBe(
      '/verify?email=eater%40example.test&next=%2Fdiary',
    );
  });
});
