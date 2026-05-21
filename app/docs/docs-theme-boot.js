'use client';

import { useEffect } from 'react';

const THEME_KEY = 'dataWorkbenchThemeV2';
const THEMES = ['midnight', 'harbor', 'forge', 'field', 'ink', 'paper'];

export default function DocsThemeBoot() {
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      document.documentElement.setAttribute(
        'data-theme',
        THEMES.includes(savedTheme) ? savedTheme : 'midnight'
      );
    } catch {
      document.documentElement.setAttribute('data-theme', 'midnight');
    }
  }, []);

  return null;
}
