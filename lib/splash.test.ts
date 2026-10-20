import { describe, expect, it } from 'vitest';
import {
  parseSplashSize,
  splashMedia,
  splashScreens,
  splashSize,
} from './splash.ts';

describe('splashScreens', () => {
  it('gives every screen a size of its own', () => {
    const sizes = splashScreens.map(splashSize);

    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it('sizes each image in device pixels, portrait', () => {
    const iphone16 = { width: 393, height: 852, pixelRatio: 3 };

    expect(splashSize(iphone16)).toBe('1179x2556');
    expect(splashMedia(iphone16)).toBe(
      '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    );
  });
});

describe('parseSplashSize', () => {
  it('reads back a size', () => {
    expect(parseSplashSize('1179x2556')).toEqual({ width: 1179, height: 2556 });
  });

  it('refuses anything else', () => {
    expect(parseSplashSize('1179')).toBeNull();
    expect(parseSplashSize('ax2556')).toBeNull();
  });
});
