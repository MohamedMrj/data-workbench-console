'use client';

import { useEffect } from 'react';

const THEME_KEY = 'dataWorkbenchThemeV2';
const THEME_MODE_KEY = 'dataWorkbenchThemeModeV1';
const THEMES = ['glass', 'oled', 'neon', 'minimal', 'neumorphic', 'pastel', 'cyberpunk', 'cottagecore', 'garden', 'space'];
// Same mapping as the app: an id saved before the themes became full looks still resolves.
const LEGACY_THEMES = { midnight: 'glass', harbor: 'glass', ink: 'neon', forge: 'cyberpunk', field: 'cottagecore', paper: 'minimal' };

function resolveTone(stored, mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  if (mode === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === false ? 'light' : 'dark';
  }
  return stored === 'paper' ? 'light' : 'dark';
}

export default function DocsThemeBoot() {
  useEffect(() => {
    let stored = '';
    let mode = '';
    try {
      stored = String(localStorage.getItem(THEME_KEY) || '').toLowerCase();
      mode = String(localStorage.getItem(THEME_MODE_KEY) || '');
    } catch {
      // Storage blocked: the default look.
    }
    const theme = THEMES.includes(stored) ? stored : (LEGACY_THEMES[stored] || 'glass');
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme-tone', resolveTone(stored, mode));
  }, []);

  return null;
}
