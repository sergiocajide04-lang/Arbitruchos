import { useCallback, useEffect, useState } from 'react';
import brand from '@/config/brand.json';
import { PREF_KEYS, readPref, writePref } from './storage';

export type ThemePref = 'dark' | 'light' | 'system';

function resolve(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return pref;
}

export function readThemePref(): ThemePref {
  const v = readPref(PREF_KEYS.theme);
  return v === 'light' || v === 'system' ? v : 'dark';
}

export function applyTheme(pref: ThemePref) {
  const theme = resolve(pref);
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', theme === 'light' ? '#F3F4F0' : brand.colors.background);
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  useEffect(() => {
    applyTheme(pref);
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [pref]);
  const update = useCallback((next: ThemePref) => {
    writePref(PREF_KEYS.theme, next);
    setPref(next);
  }, []);
  return { pref, setPref: update };
}
