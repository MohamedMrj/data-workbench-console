// Generates the theme definitions and the background scenery at the end of app/theme.css.
// Run with: node scripts/generate-theme-css.mjs   (edit the themes here, never in theme.css)
// Each theme's living scene is markup in app/components/theme-scenery.js styled by
// app/theme-scenery.css. A theme can still add static mask layers here (scenery.a/b/c, built with
// svg() and layer()): only the shape's alpha matters, and the colour comes from the theme tokens.
import fs from 'fs';
const F = 'app/theme.css';
let css = fs.readFileSync(F, 'utf8').replace(/\r\n/g, '\n');
const marker = '/* ═══ Theme definitions';
const cutAt = css.indexOf(marker);
if (cutAt < 0) throw new Error('marker missing');
css = css.slice(0, cutAt);

const svg = (w, h, body, extra = '') => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'${extra}>${body}</svg>`)}")`;

// ── per-theme definitions ──────────────────────────────────────────────────────────
// layers: [mask images, sizes, positions, repeat] for scenery layers a/b/c; colors per tone.
const T = {};
const layer = (images, sizes, positions, repeat = 'no-repeat') => ({ images, sizes, positions, repeat });

T.glass = {
  title: 'Liquid Glass — frosted, translucent panels with glossy edges and colourful depth behind them.',
  structure: { '--surface-blur': '24px', '--orb-opacity': '0.45' },
  dark: {
    '--bg': '#071116', '--bg-soft': '#0d1b23', '--surface': 'rgba(12, 28, 38, 0.56)', '--surface-strong': '#14303d', '--surface-soft': '#1b3a48', '--surface-raised': 'rgba(20, 40, 54, 0.78)',
    '--line': 'rgba(190, 225, 240, 0.16)', '--line-strong': 'rgba(190, 225, 240, 0.3)', '--text': '#edf5f7', '--muted': '#8da6b3',
    '--accent': '#22b8a8', '--accent-2': '#f97316', '--accent-soft': 'rgba(34, 184, 168, 0.18)', '--success': '#23c16b', '--warning': '#f4b942', '--danger': '#ff6b57',
    '--panel-glow': '0 24px 60px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    '--page-background': 'radial-gradient(circle at 12% 8%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 34%), radial-gradient(circle at 88% 92%, color-mix(in srgb, var(--accent-2) 26%, transparent), transparent 32%), linear-gradient(160deg, var(--bg) 0%, color-mix(in srgb, var(--bg-soft) 80%, var(--accent) 6%) 55%, var(--bg) 100%)'
  },
  light: {
    '--bg': '#e9f3f7', '--bg-soft': '#f4f8fb', '--surface': 'rgba(255, 255, 255, 0.55)', '--surface-strong': '#ffffff', '--surface-soft': '#eef5f8', '--surface-raised': 'rgba(255, 255, 255, 0.78)',
    '--line': 'rgba(40, 80, 100, 0.14)', '--line-strong': 'rgba(40, 80, 100, 0.26)', '--text': '#13262f', '--muted': '#557080',
    '--accent': '#0e9f90', '--accent-2': '#f2711c', '--accent-soft': 'rgba(14, 159, 144, 0.14)', '--success': '#1a9e57', '--warning': '#b07a0e', '--danger': '#d9432f',
    '--panel-glow': '0 22px 50px rgba(40, 80, 100, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
    '--page-background': 'radial-gradient(circle at 12% 8%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 36%), radial-gradient(circle at 88% 92%, color-mix(in srgb, var(--accent-2) 18%, transparent), transparent 34%), linear-gradient(160deg, var(--bg) 0%, var(--bg-soft) 100%)'
  },
  scenery: {},
  extra: `/* Liquid Glass: the strongest glass of all themes, with a glossy edge on every panel and a
   specular lift on hover. */
:root[data-theme='glass'] .surface {
  border-color: rgba(255, 255, 255, 0.13);
  box-shadow: var(--panel-glow), inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 1px 0 0 rgba(255, 255, 255, 0.05);
}

:root[data-theme='glass'][data-theme-tone='light'] .surface {
  border-color: rgba(255, 255, 255, 0.8);
  box-shadow: var(--panel-glow), inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

:root[data-theme='glass'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn) {
  transition: box-shadow 220ms ease, border-color 220ms ease, filter 220ms ease, background-color 220ms ease;
}

:root[data-theme='glass'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn):hover:not(:disabled) {
  filter: brightness(1.06) saturate(1.08);
}`
};

T.oled = {
  title: 'Dark & OLED Black — true black for low light, with muted pastel accents.',
  structure: { '--theme-ambient': '0', '--surface-blur': '0px', '--orb-opacity': '0', '--radius-xl': '18px', '--radius-lg': '14px', '--radius-md': '10px', '--font-heading': "'Space Grotesk', 'Sora', sans-serif", '--heading-tracking': '-0.01em' },
  dark: {
    '--bg': '#000000', '--bg-soft': '#000000', '--surface': 'rgba(0, 0, 0, 0.96)', '--surface-strong': '#050505', '--surface-soft': '#101010', '--surface-raised': 'rgba(8, 8, 8, 0.98)',
    '--line': 'rgba(255, 255, 255, 0.1)', '--line-strong': 'rgba(255, 255, 255, 0.2)', '--text': '#f5f5f5', '--muted': '#8f8f8f',
    '--accent': '#8ab4ff', '--accent-2': '#ff8fb1', '--accent-soft': 'rgba(138, 180, 255, 0.14)', '--success': '#6ee7a8', '--warning': '#ffd166', '--danger': '#ff6b6b',
    '--on-accent': '#000000', '--panel-glow': 'none', '--shadow': '0 18px 44px rgba(0, 0, 0, 0.8)',
    '--glass-highlight': 'rgba(255, 255, 255, 0.05)', '--glass-body': '#0a0a0a',
    '--page-background': 'linear-gradient(transparent, transparent), linear-gradient(transparent, transparent), #000000'
  },
  light: {
    '--bg': '#ffffff', '--bg-soft': '#fafafa', '--surface': 'rgba(255, 255, 255, 1)', '--surface-strong': '#ffffff', '--surface-soft': '#f4f4f4', '--surface-raised': 'rgba(255, 255, 255, 1)',
    '--line': 'rgba(0, 0, 0, 0.12)', '--line-strong': 'rgba(0, 0, 0, 0.26)', '--text': '#000000', '--muted': '#555555',
    '--accent': '#1f5fff', '--accent-2': '#d6336c', '--accent-soft': 'rgba(31, 95, 255, 0.1)', '--success': '#11804b', '--warning': '#9a6200', '--danger': '#c92a2a',
    '--panel-glow': 'none', '--shadow': '0 14px 34px rgba(0, 0, 0, 0.12)',
    '--page-background': 'linear-gradient(transparent, transparent), linear-gradient(transparent, transparent), #ffffff'
  },
  scenery: {},
  extra: `/* OLED Black: true black, crisp text, thin borders and no shadows, blur or glass. */
/* No blur here, so panels are solid: the scenery never shows behind text. */
:root[data-theme='oled'] {
  --panel-bg: linear-gradient(180deg, var(--surface-raised), var(--surface));
}

:root[data-theme='oled'] body {
  -webkit-font-smoothing: antialiased;
}

:root[data-theme='oled'] .surface {
  box-shadow: none;
  backdrop-filter: none;
}

:root[data-theme='oled'] :is(.secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn) {
  border-color: color-mix(in srgb, var(--glass-tint) 42%, var(--line-strong));
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

:root[data-theme='oled'] :is(.secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn):hover:not(:disabled) {
  border-color: var(--glass-tint);
  background: color-mix(in srgb, var(--glass-tint) 9%, transparent);
  box-shadow: none;
}

:root[data-theme='oled'] .primary-btn,
:root[data-theme='oled'] .primary-btn:hover:not(:disabled) {
  background: var(--glass-tint);
  box-shadow: none;
  text-shadow: none;
}`
};

T.neon = {
  title: 'Matte Dark & Neon — flat matte surfaces, no blur, thin neon lines and glowing accents.',
  structure: { '--theme-ambient': '0.35', '--radius-xl': '16px', '--radius-lg': '12px', '--radius-md': '9px', '--font-heading': "'Space Grotesk', 'Sora', sans-serif", '--heading-tracking': '0', '--surface-blur': '0px', '--orb-opacity': '0' },
  dark: {
    '--bg': '#050507', '--bg-soft': '#0b0b10', '--surface': 'rgba(16, 16, 22, 0.97)', '--surface-strong': '#121218', '--surface-soft': '#1a1a22', '--surface-raised': 'rgba(20, 20, 27, 0.99)',
    '--line': 'rgba(0, 229, 255, 0.14)', '--line-strong': 'rgba(0, 229, 255, 0.3)', '--text': '#e9f3ff', '--muted': '#8a93a6',
    '--accent': '#00e5ff', '--accent-2': '#b14dff', '--accent-soft': 'rgba(0, 229, 255, 0.16)', '--success': '#39ff88', '--warning': '#ffd23f', '--danger': '#ff3d71',
    '--on-accent': '#04131a', '--panel-glow': '0 0 0 1px rgba(0, 229, 255, 0.05), 0 18px 40px rgba(0, 0, 0, 0.6)', '--shadow': '0 18px 44px rgba(0, 0, 0, 0.65)',
    '--glass-highlight': 'rgba(255, 255, 255, 0.05)', '--glass-edge': 'rgba(0, 229, 255, 0.2)', '--glass-body': '#101016',
    '--tint-explorer': '#00e5ff', '--tint-builder': '#b14dff', '--tint-results': '#c6ff00', '--tint-activity': '#ff3df2',
    '--page-background': 'linear-gradient(transparent, transparent), linear-gradient(transparent, transparent), linear-gradient(180deg, #050507 0%, #0b0b10 100%)'
  },
  light: {
    '--bg': '#f4f6fb', '--bg-soft': '#eef1f8', '--surface': 'rgba(255, 255, 255, 0.98)', '--surface-strong': '#ffffff', '--surface-soft': '#f1f3f9', '--surface-raised': 'rgba(255, 255, 255, 1)',
    '--line': 'rgba(0, 140, 180, 0.16)', '--line-strong': 'rgba(0, 140, 180, 0.32)', '--text': '#0b0f1a', '--muted': '#5b6475',
    '--accent': '#0090b8', '--accent-2': '#8a2be2', '--accent-soft': 'rgba(0, 144, 184, 0.12)', '--success': '#0e9f4f', '--warning': '#a97c00', '--danger': '#d61f4f',
    '--panel-glow': '0 0 0 1px rgba(0, 144, 184, 0.06), 0 14px 32px rgba(11, 15, 26, 0.08)', '--shadow': '0 14px 36px rgba(11, 15, 26, 0.12)',
    '--tint-explorer': '#0090b8', '--tint-builder': '#8a2be2', '--tint-results': '#6b8f00', '--tint-activity': '#c2189a',
    '--page-background': 'linear-gradient(transparent, transparent), linear-gradient(transparent, transparent), linear-gradient(180deg, #f4f6fb 0%, #eef1f8 100%)'
  },
  scenery: {},
  extra: `:root[data-theme='neon'][data-theme-tone='dark'] :is(h1, h2) {
  text-shadow: 0 0 14px color-mix(in srgb, var(--accent) 45%, transparent);
}

:root[data-theme='neon'] .primary-btn {
  box-shadow: 0 0 0 1px var(--accent);
}
/* No blur here, so panels are solid: the scenery never shows behind text. */
:root[data-theme='neon'] {
  --panel-bg: linear-gradient(180deg, var(--surface-raised), var(--surface));
}

/* Matte panels; buttons are flat with a thin neon edge, and only hover, selection and focus glow. */
:root[data-theme='neon'] :is(.secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn) {
  border-color: color-mix(in srgb, var(--glass-tint) 45%, transparent);
  background: var(--glass-body);
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

:root[data-theme='neon'] :is(.secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn):hover:not(:disabled) {
  border-color: var(--glass-tint);
  background: color-mix(in srgb, var(--glass-tint) 8%, var(--glass-body));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--glass-tint) 45%, transparent), 0 0 14px color-mix(in srgb, var(--glass-tint) 32%, transparent);
}

:root[data-theme='neon'] .primary-btn:hover:not(:disabled) {
  box-shadow: 0 0 0 1px var(--accent), 0 0 24px color-mix(in srgb, var(--accent) 55%, transparent);
}

:root[data-theme='neon'] :is(.segment-btn.active, .theme-chip.active, .table-item.active, .procedure-item.active, .column-pill.active, .result-tab.active) {
  box-shadow: 0 0 0 1px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 30%, transparent);
}`
};

T.minimal = {
  title: 'Minimal / Digital Detox — white space, monochrome, no shadows, blur or decoration.',
  structure: { '--theme-ambient': '0.15', '--radius-xl': '14px', '--radius-lg': '10px', '--radius-md': '8px', '--font-heading': "'Manrope', sans-serif", '--heading-tracking': '-0.01em', '--surface-blur': '0px', '--orb-opacity': '0', '--panel-glow': 'none', '--glass-highlight': 'transparent', '--glass-shade': 'transparent' },
  dark: {
    '--bg': '#141414', '--bg-soft': '#181818', '--surface': 'rgba(28, 28, 28, 1)', '--surface-strong': '#1c1c1c', '--surface-soft': '#242424', '--surface-raised': 'rgba(31, 31, 31, 1)',
    '--line': 'rgba(255, 255, 255, 0.1)', '--line-strong': 'rgba(255, 255, 255, 0.2)', '--text': '#ededed', '--muted': '#9a9a9a',
    '--accent': '#e6e6e6', '--accent-2': '#a0a0a0', '--accent-soft': 'rgba(255, 255, 255, 0.08)', '--success': '#7bc47f', '--warning': '#e0b052', '--danger': '#ef6b6b',
    '--on-accent': '#111111', '--shadow': '0 12px 32px rgba(0, 0, 0, 0.5)', '--glass-edge': 'rgba(255, 255, 255, 0.16)', '--glass-body': '#1c1c1c',
    '--tint-connection': '#cfcfcf', '--tint-header': '#cfcfcf', '--tint-explorer': '#cfcfcf', '--tint-builder': '#cfcfcf', '--tint-editor': '#cfcfcf', '--tint-results': '#cfcfcf', '--tint-activity': '#cfcfcf', '--tint-dialogs': '#cfcfcf',
    '--page-background': 'linear-gradient(transparent, transparent), linear-gradient(transparent, transparent), #141414'
  },
  light: {
    '--bg': '#f7f7f5', '--bg-soft': '#f2f2ef', '--surface': 'rgba(255, 255, 255, 1)', '--surface-strong': '#ffffff', '--surface-soft': '#f3f3f1', '--surface-raised': 'rgba(255, 255, 255, 1)',
    '--line': 'rgba(17, 17, 17, 0.1)', '--line-strong': 'rgba(17, 17, 17, 0.2)', '--text': '#161616', '--muted': '#6b6b6b',
    '--accent': '#2b2b2b', '--accent-2': '#6b6b6b', '--accent-soft': 'rgba(0, 0, 0, 0.06)', '--success': '#2e7d32', '--warning': '#9a5b00', '--danger': '#c62828',
    '--input-bg': '#ffffff', '--input-border': 'rgba(17, 17, 17, 0.22)', '--control-bg': '#ffffff', '--control-bg-hover': '#f3f3f1', '--control-border': 'rgba(17, 17, 17, 0.18)',
    '--selected-bg': '#ececea', '--selected-border': 'rgba(17, 17, 17, 0.5)', '--shadow': '0 12px 32px rgba(0, 0, 0, 0.08)', '--glass-edge': 'rgba(17, 17, 17, 0.16)', '--glass-body': '#ffffff',
    '--tint-connection': '#3a3a3a', '--tint-header': '#3a3a3a', '--tint-explorer': '#3a3a3a', '--tint-builder': '#3a3a3a', '--tint-editor': '#3a3a3a', '--tint-results': '#3a3a3a', '--tint-activity': '#3a3a3a', '--tint-dialogs': '#3a3a3a',
    '--page-background': 'linear-gradient(transparent, transparent), linear-gradient(transparent, transparent), #f7f7f5'
  },
  scenery: {},
  extra: `:root[data-theme='minimal'] .eyebrow {
  color: var(--muted);
}

:root[data-theme='minimal'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn, .text-btn, .theme-chip, .table-item, .procedure-item, .saved-item-main, .history-item, .result-tab, .column-pill, .surface) {
  box-shadow: none;
}
/* No blur here, so panels are solid: the scenery never shows behind text. */
:root[data-theme='minimal'] {
  --panel-bg: linear-gradient(180deg, var(--surface-raised), var(--surface));
}

/* Flat controls: no glass, gradients or text shadow; type and spacing carry the design. */
:root[data-theme='minimal'] :is(.secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn) {
  background: var(--control-bg);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

:root[data-theme='minimal'] :is(.secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn):hover:not(:disabled) {
  background: var(--control-bg-hover);
}

:root[data-theme='minimal'] .primary-btn,
:root[data-theme='minimal'] .primary-btn:hover:not(:disabled) {
  background: var(--glass-tint);
  text-shadow: none;
}`
};

T.neumorphic = {
  title: 'Neomorphic / Soft 3D — panels and buttons look gently pressed out of the page, with soft light and shade.',
  structure: { '--theme-ambient': '0.3', '--radius-xl': '26px', '--radius-lg': '20px', '--radius-md': '14px', '--font-heading': "'Manrope', sans-serif", '--heading-tracking': '-0.01em', '--surface-blur': '0px', '--orb-opacity': '0' },
  dark: {
    '--bg': '#262b33', '--bg-soft': '#262b33', '--surface': 'rgba(38, 43, 51, 1)', '--surface-strong': '#262b33', '--surface-soft': '#2b313a', '--surface-raised': 'rgba(40, 46, 55, 1)',
    '--line': 'rgba(255, 255, 255, 0.05)', '--line-strong': 'rgba(255, 255, 255, 0.1)', '--text': '#e3e8f0', '--muted': '#8e98a8',
    '--accent': '#7aa2ff', '--accent-2': '#ff9f6e', '--accent-soft': 'rgba(122, 162, 255, 0.14)', '--success': '#6fd39b', '--warning': '#f2c46b', '--danger': '#ff7a7a',
    '--on-accent': '#10162a', '--neu-dark': 'rgba(0, 0, 0, 0.45)', '--neu-light': 'rgba(255, 255, 255, 0.06)',
    '--page-background': 'linear-gradient(transparent, transparent), linear-gradient(transparent, transparent), #262b33'
  },
  light: {
    '--bg': '#e6eaf0', '--bg-soft': '#e6eaf0', '--surface': 'rgba(230, 234, 240, 1)', '--surface-strong': '#e6eaf0', '--surface-soft': '#e9edf3', '--surface-raised': 'rgba(232, 236, 242, 1)',
    '--line': 'rgba(163, 177, 198, 0.25)', '--line-strong': 'rgba(163, 177, 198, 0.45)', '--text': '#2f3a4a', '--muted': '#6b7789',
    '--accent': '#5b7cfa', '--accent-2': '#f08a5d', '--accent-soft': 'rgba(91, 124, 250, 0.12)', '--success': '#2f9d62', '--warning': '#b5821c', '--danger': '#d6544f',
    '--neu-dark': 'rgba(163, 177, 198, 0.65)', '--neu-light': 'rgba(255, 255, 255, 0.9)', '--input-bg': '#e6eaf0',
    '--page-background': 'linear-gradient(transparent, transparent), linear-gradient(transparent, transparent), #e6eaf0'
  },
  scenery: {},
  extra: `:root[data-theme='neumorphic'] {
  --panel-glow: 10px 10px 26px var(--neu-dark), -10px -10px 26px var(--neu-light);
  --shadow: 12px 12px 30px var(--neu-dark), -12px -12px 30px var(--neu-light);
}

:root[data-theme='neumorphic'] .surface {
  background: var(--surface-strong);
  border-color: transparent;
}

:root[data-theme='neumorphic'] :is(.secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn, .text-btn, .theme-chip, .saved-item-main, .saved-item-delete, .history-item, .table-item, .procedure-item, .column-pill, .result-tab, .editor-tab-main, .editor-tab-close, .editor-tab-new, .tools-command, .result-cell-toggle) {
  border-color: transparent;
  background: var(--surface-strong);
  box-shadow: 4px 4px 10px var(--neu-dark), -4px -4px 10px var(--neu-light);
}

:root[data-theme='neumorphic'] :is(.secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn, .text-btn, .theme-chip, .saved-item-main, .history-item, .table-item, .procedure-item, .column-pill, .result-tab, .tools-command):hover:not(:disabled) {
  background: var(--surface-strong);
  box-shadow: 6px 6px 14px var(--neu-dark), -6px -6px 14px var(--neu-light);
}

/* Selected and active controls look pressed in. */
:root[data-theme='neumorphic'] :is(.segment-btn.active, .theme-chip.active, .table-item.active, .procedure-item.active, .column-pill.active, .result-tab.active, .saved-item-main.active) {
  background: var(--surface-strong);
  color: var(--accent);
  box-shadow: inset 4px 4px 10px var(--neu-dark), inset -4px -4px 10px var(--neu-light);
}

:root[data-theme='neumorphic'] :is(input, select, textarea) {
  border-color: transparent;
  box-shadow: inset 3px 3px 8px var(--neu-dark), inset -3px -3px 8px var(--neu-light);
}

:root[data-theme='neumorphic'] .primary-btn {
  box-shadow: 5px 5px 14px var(--neu-dark), -5px -5px 14px var(--neu-light);
}

/* A pressed control sinks into the page while it is held. */
:root[data-theme='neumorphic'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn):active:not(:disabled) {
  box-shadow: inset 3px 3px 8px var(--neu-dark), inset -3px -3px 8px var(--neu-light);
}`
};

T.pastel = {
  title: 'Pastel & Soft — warm pastels, rounder shapes, gentle coloured shadows.',
  structure: { '--radius-xl': '32px', '--radius-lg': '24px', '--radius-md': '18px', '--font-heading': "'Manrope', sans-serif", '--heading-tracking': '-0.01em', '--surface-blur': '12px', '--orb-opacity': '0.5' },
  dark: {
    '--bg': '#1f1b2e', '--bg-soft': '#261f35', '--surface': 'rgba(42, 35, 60, 0.82)', '--surface-strong': '#2c2540', '--surface-soft': '#352c4c', '--surface-raised': 'rgba(48, 40, 68, 0.95)',
    '--line': 'rgba(244, 170, 210, 0.16)', '--line-strong': 'rgba(244, 170, 210, 0.3)', '--text': '#f6eefa', '--muted': '#b9a8c9',
    '--accent': '#f9a8d4', '--accent-2': '#c4b5fd', '--accent-soft': 'rgba(249, 168, 212, 0.16)', '--success': '#86efac', '--warning': '#fde68a', '--danger': '#fda4af',
    '--on-accent': '#3a2440', '--panel-glow': '0 18px 42px rgba(0, 0, 0, 0.35)',
    '--tint-connection': '#86efac', '--tint-explorer': '#93c5fd', '--tint-builder': '#c4b5fd', '--tint-results': '#fde68a', '--tint-activity': '#f9a8d4',
    '--page-background': 'radial-gradient(circle at 10% 10%, rgba(249, 168, 212, 0.18), transparent 34%), radial-gradient(circle at 90% 85%, rgba(134, 239, 172, 0.14), transparent 32%), linear-gradient(160deg, #1f1b2e 0%, #261f35 100%)'
  },
  light: {
    '--bg': '#fff5f9', '--bg-soft': '#f3f0ff', '--surface': 'rgba(255, 255, 255, 0.82)', '--surface-strong': '#ffffff', '--surface-soft': '#fdf2f8', '--surface-raised': 'rgba(255, 255, 255, 0.95)',
    '--line': 'rgba(190, 140, 190, 0.22)', '--line-strong': 'rgba(170, 120, 180, 0.36)', '--text': '#4a3b52', '--muted': '#8d7a99',
    '--accent': '#ec6fb0', '--accent-2': '#a78bfa', '--accent-soft': 'rgba(236, 111, 176, 0.16)', '--success': '#2fb886', '--warning': '#c98a0a', '--danger': '#f05a7e',
    '--input-bg': '#ffffff', '--control-bg': 'linear-gradient(180deg, #ffffff, #fdf2f8)', '--panel-glow': '0 16px 38px rgba(236, 72, 153, 0.1)', '--shadow': '0 16px 40px rgba(167, 139, 250, 0.18)',
    '--tint-connection': '#34c38f', '--tint-explorer': '#60a5fa', '--tint-builder': '#a78bfa', '--tint-results': '#f59e0b', '--tint-activity': '#ec6fb0',
    '--page-background': 'radial-gradient(circle at 10% 10%, rgba(249, 168, 212, 0.45), transparent 32%), radial-gradient(circle at 90% 85%, rgba(167, 243, 208, 0.45), transparent 30%), linear-gradient(160deg, #fff5f9 0%, #f3f0ff 100%)'
  },
  scenery: {},
  extra: `:root[data-theme='pastel'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .save-conn-btn) {
  border-radius: 999px;
}

/* Buttons lift a pixel on hover: a translation, so their size never changes. */
@media (prefers-reduced-motion: no-preference) {
  :root[data-theme='pastel'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn) {
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  :root[data-theme='pastel'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn):hover:not(:disabled) {
    transform: translateY(-1px);
  }
}`
};

T.cyberpunk = {
  title: 'Cyberpunk / Retro-Tech — neon pink and cyan, a synthwave sun over a glowing grid, HUD headings.',
  structure: { '--radius-xl': '6px', '--radius-lg': '4px', '--radius-md': '3px', '--font-heading': "'Space Grotesk', 'IBM Plex Mono', monospace", '--heading-tracking': '0.04em', '--heading-transform': 'uppercase', '--surface-blur': '6px', '--orb-opacity': '0.35' },
  dark: {
    '--bg': '#07040f', '--bg-soft': '#0d0620', '--surface': 'rgba(14, 8, 30, 0.86)', '--surface-strong': '#140b2a', '--surface-soft': '#1d1238', '--surface-raised': 'rgba(22, 12, 44, 0.96)',
    '--line': 'rgba(0, 240, 255, 0.18)', '--line-strong': 'rgba(255, 43, 214, 0.34)', '--text': '#f2ecff', '--muted': '#9b8fc0',
    '--accent': '#ff2bd6', '--accent-2': '#00f0ff', '--accent-soft': 'rgba(255, 43, 214, 0.16)', '--success': '#00ff9c', '--warning': '#ffe600', '--danger': '#ff3355',
    '--panel-glow': '0 0 0 1px rgba(255, 43, 214, 0.14), 0 0 30px rgba(255, 43, 214, 0.12)', '--shadow': '0 0 0 1px rgba(0, 240, 255, 0.2), 0 24px 60px rgba(0, 0, 0, 0.6)',
    '--tint-connection': '#00f0ff', '--tint-header': '#ff2bd6', '--tint-explorer': '#00f0ff', '--tint-builder': '#ff2bd6', '--tint-results': '#ffe600', '--tint-activity': '#b14dff',
    '--page-background': 'repeating-linear-gradient(0deg, rgba(0, 240, 255, 0.05) 0 1px, transparent 1px 42px), repeating-linear-gradient(90deg, rgba(255, 43, 214, 0.045) 0 1px, transparent 1px 42px), linear-gradient(180deg, #07040f 0%, #120830 70%, #2a0a3d 100%)'
  },
  light: {
    '--bg': '#fdf2ff', '--bg-soft': '#eef9ff', '--surface': 'rgba(255, 255, 255, 0.86)', '--surface-strong': '#ffffff', '--surface-soft': '#f6edff', '--surface-raised': 'rgba(255, 255, 255, 0.96)',
    '--line': 'rgba(0, 150, 180, 0.2)', '--line-strong': 'rgba(212, 0, 159, 0.3)', '--text': '#1c0b2e', '--muted': '#6d5a85',
    '--accent': '#d4009f', '--accent-2': '#0096b4', '--accent-soft': 'rgba(212, 0, 159, 0.12)', '--success': '#00895a', '--warning': '#9a7b00', '--danger': '#e0003c',
    '--panel-glow': '0 0 0 1px rgba(212, 0, 159, 0.1), 0 14px 32px rgba(28, 11, 46, 0.1)', '--shadow': '0 0 0 1px rgba(0, 150, 180, 0.2), 0 18px 44px rgba(28, 11, 46, 0.14)',
    '--tint-connection': '#0096b4', '--tint-header': '#d4009f', '--tint-explorer': '#0096b4', '--tint-builder': '#d4009f', '--tint-results': '#a37f00', '--tint-activity': '#7c2bd1',
    '--page-background': 'repeating-linear-gradient(0deg, rgba(0, 150, 180, 0.07) 0 1px, transparent 1px 42px), repeating-linear-gradient(90deg, rgba(212, 0, 159, 0.05) 0 1px, transparent 1px 42px), linear-gradient(180deg, #fdf2ff 0%, #eef9ff 100%)'
  },
  scenery: {},
  extra: `:root[data-theme='cyberpunk'] :is(h1, h2) {
  text-shadow: 2px 0 0 color-mix(in srgb, var(--accent) 55%, transparent), -2px 0 0 color-mix(in srgb, var(--accent-2) 45%, transparent);
}

:root[data-theme='cyberpunk'] .eyebrow {
  font-family: 'IBM Plex Mono', monospace;
  color: var(--accent-2);
}

:root[data-theme='cyberpunk'] .surface {
  border-color: var(--line-strong);
}

/* A pink edge on the left of each panel and a cyan one on the right. */
:root[data-theme='cyberpunk'] .surface {
  box-shadow: var(--panel-glow), inset 3px 0 0 color-mix(in srgb, var(--accent) 55%, transparent), inset -3px 0 0 color-mix(in srgb, var(--accent-2) 45%, transparent);
}

/* Cut corners on primary buttons; focus drops the cut so the outline is never clipped. */
:root[data-theme='cyberpunk'] .primary-btn {
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}

:root[data-theme='cyberpunk'] .primary-btn:focus-visible {
  clip-path: none;
}

:root[data-theme='cyberpunk'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn, .text-btn, .theme-chip, .table-item, .procedure-item, .column-pill, .history-item, .saved-item-main):focus-visible {
  outline: 2px solid var(--accent-2);
  outline-offset: 2px;
}`
};

T.cottagecore = {
  title: 'Cottagecore & Organic — warm paper, sage and terracotta, serif headings, wildflowers and mushrooms.',
  structure: { '--radius-xl': '22px', '--radius-lg': '16px', '--radius-md': '12px', '--font-heading': "Georgia, Cambria, 'Times New Roman', serif", '--heading-tracking': '0', '--surface-blur': '6px', '--orb-opacity': '0.3' },
  dark: {
    '--bg': '#1f1a14', '--bg-soft': '#262017', '--surface': 'rgba(44, 37, 28, 0.9)', '--surface-strong': '#2d261c', '--surface-soft': '#362e22', '--surface-raised': 'rgba(50, 42, 31, 0.96)',
    '--line': 'rgba(230, 210, 170, 0.14)', '--line-strong': 'rgba(230, 210, 170, 0.26)', '--text': '#f1e8d6', '--muted': '#b8a98d',
    '--accent': '#9cbf8b', '--accent-2': '#e09a6b', '--accent-soft': 'rgba(156, 191, 139, 0.16)', '--success': '#9cbf8b', '--warning': '#e3b55c', '--danger': '#e07b62',
    '--on-accent': '#1f1a14', '--panel-glow': '0 16px 38px rgba(0, 0, 0, 0.35)',
    '--tint-connection': '#9cbf8b', '--tint-explorer': '#9cbf8b', '--tint-builder': '#c4a6e0', '--tint-results': '#e09a6b', '--tint-activity': '#e0a0b4',
    '--page-background': 'radial-gradient(rgba(241, 232, 214, 0.05) 1px, transparent 1.4px), radial-gradient(circle at 85% 10%, rgba(224, 154, 107, 0.12), transparent 34%), linear-gradient(170deg, #1f1a14 0%, #262017 100%)'
  },
  light: {
    '--bg': '#f4eedf', '--bg-soft': '#ebe2cc', '--surface': 'rgba(252, 248, 238, 0.9)', '--surface-strong': '#fbf6ea', '--surface-soft': '#f1e8d4', '--surface-raised': 'rgba(253, 250, 242, 0.97)',
    '--line': 'rgba(94, 76, 52, 0.16)', '--line-strong': 'rgba(94, 76, 52, 0.3)', '--text': '#3b3226', '--muted': '#7d6f5a',
    '--accent': '#5f8a52', '--accent-2': '#c0703f', '--accent-soft': 'rgba(95, 138, 82, 0.16)', '--success': '#4f8a3e', '--warning': '#9e6d1d', '--danger': '#b5513b',
    '--input-bg': '#fffdf6', '--control-bg': 'linear-gradient(180deg, #fffdf6, #f1e8d4)', '--panel-glow': '0 16px 38px rgba(94, 76, 52, 0.12)', '--shadow': '0 18px 44px rgba(94, 76, 52, 0.16)',
    '--tint-connection': '#5f8a52', '--tint-explorer': '#5f8a52', '--tint-builder': '#9a72c0', '--tint-results': '#c0703f', '--tint-activity': '#c06f8d',
    '--page-background': 'radial-gradient(rgba(94, 76, 52, 0.07) 1px, transparent 1.4px), radial-gradient(circle at 85% 10%, rgba(192, 112, 63, 0.16), transparent 34%), linear-gradient(170deg, #f4eedf 0%, #e9e0c8 100%)'
  },
  scenery: {},
  extra: `:root[data-theme='cottagecore'] :is(body, .page-drift) {
  background-size: 18px 18px, auto, auto;
}

/* Handmade: paper-solid panels rather than glass, softly uneven corners and a stitched line
   inside each panel. */
:root[data-theme='cottagecore'] {
  --panel-bg: linear-gradient(180deg, var(--surface-raised), var(--surface));
}

:root[data-theme='cottagecore'] .surface {
  box-shadow: var(--panel-glow), inset 0 0 0 5px color-mix(in srgb, var(--surface-strong) 60%, transparent), inset 0 0 0 6px color-mix(in srgb, var(--line-strong) 70%, transparent);
}

:root[data-theme='cottagecore'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn) {
  border-radius: 13px 10px 14px 9px / 10px 14px 9px 13px;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}`
};

T.garden = {
  title: 'Garden / Botanical — organic greens with earth accents: calm cream and sage by day, moody forest with lime by night.',
  structure: { '--radius-xl': '26px', '--radius-lg': '20px', '--radius-md': '14px', '--font-heading': "'Manrope', sans-serif", '--heading-tracking': '-0.015em', '--surface-blur': '10px', '--orb-opacity': '0.35' },
  dark: {
    '--bg': '#070d09', '--bg-soft': '#0c1710', '--surface': 'rgba(14, 26, 18, 0.88)', '--surface-strong': '#102016', '--surface-soft': '#17291d', '--surface-raised': 'rgba(18, 32, 22, 0.95)',
    '--line': 'rgba(132, 255, 120, 0.12)', '--line-strong': 'rgba(132, 255, 120, 0.24)', '--text': '#e6f4e6', '--muted': '#8fa892',
    '--accent': '#7cff5a', '--accent-2': '#2dd4a0', '--accent-soft': 'rgba(124, 255, 90, 0.14)', '--success': '#7cff5a', '--warning': '#e8d44d', '--danger': '#ff6b5b',
    '--on-accent': '#07160a', '--panel-glow': '0 20px 48px rgba(0, 0, 0, 0.45)', '--theme-ambient': '0.4',
    '--tint-connection': '#7cff5a', '--tint-explorer': '#2dd4a0', '--tint-builder': '#a3e635', '--tint-results': '#e8d44d', '--tint-activity': '#5eead4',
    '--page-background': 'radial-gradient(circle at 10% 90%, rgba(124, 255, 90, 0.1), transparent 36%), radial-gradient(circle at 90% 10%, rgba(45, 212, 160, 0.1), transparent 32%), linear-gradient(170deg, #070d09 0%, #0c1710 100%)'
  },
  light: {
    '--bg': '#f6f4ec', '--bg-soft': '#eef1e6', '--surface': 'rgba(255, 255, 252, 0.9)', '--surface-strong': '#fffffa', '--surface-soft': '#eef2e4', '--surface-raised': 'rgba(255, 255, 252, 0.97)',
    '--line': 'rgba(60, 90, 60, 0.14)', '--line-strong': 'rgba(60, 90, 60, 0.26)', '--text': '#1f2d1f', '--muted': '#667560',
    '--accent': '#5a7d4f', '--accent-2': '#c8745a', '--accent-soft': 'rgba(90, 125, 79, 0.14)', '--success': '#3f8a4a', '--warning': '#9e6d1d', '--danger': '#b9473a',
    '--input-bg': '#fffffa', '--panel-glow': '0 16px 40px rgba(60, 90, 60, 0.1)', '--shadow': '0 18px 44px rgba(60, 90, 60, 0.14)',
    '--tint-connection': '#5a7d4f', '--tint-explorer': '#4f7d6b', '--tint-builder': '#7d6b9a', '--tint-results': '#c8745a', '--tint-activity': '#b86b84',
    '--page-background': 'radial-gradient(circle at 10% 90%, rgba(90, 125, 79, 0.12), transparent 36%), radial-gradient(circle at 90% 10%, rgba(200, 116, 90, 0.1), transparent 32%), linear-gradient(170deg, #f6f4ec 0%, #eef1e6 100%)'
  },
  scenery: {},
  extra: `/* Garden: leaf-cut primary buttons and soft botanical depth. */
:root[data-theme='garden'] .primary-btn {
  border-radius: 18px 6px 18px 6px;
}

:root[data-theme='garden'] :is(.segment-btn.active, .table-item.active, .procedure-item.active, .column-pill.active) {
  box-shadow: inset 3px 0 0 var(--accent), 0 6px 16px color-mix(in srgb, var(--accent) 16%, transparent);
}`
};

T.space = {
  title: 'Space — a night sky with stars, a ringed planet and a spiral galaxy; a pale celestial sky in light mode.',
  structure: { '--heading-tracking': '0.01em', '--surface-blur': '12px', '--orb-opacity': '0.5' },
  dark: {
    '--bg': '#03040c', '--bg-soft': '#070a1c', '--surface': 'rgba(10, 14, 34, 0.74)', '--surface-strong': '#0f1430', '--surface-soft': '#161d42', '--surface-raised': 'rgba(16, 22, 50, 0.92)',
    '--line': 'rgba(150, 170, 255, 0.16)', '--line-strong': 'rgba(150, 170, 255, 0.3)', '--text': '#eef1ff', '--muted': '#9aa3c7',
    '--accent': '#7c9cff', '--accent-2': '#c084fc', '--accent-soft': 'rgba(124, 156, 255, 0.18)', '--success': '#4ade80', '--warning': '#fbbf24', '--danger': '#f87171',
    '--panel-glow': '0 24px 60px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(124, 156, 255, 0.06)', '--theme-ambient': '0.55',
    '--tint-explorer': '#7c9cff', '--tint-builder': '#c084fc', '--tint-results': '#fbbf24', '--tint-activity': '#f472b6',
    '--page-background': 'radial-gradient(circle at 78% 18%, rgba(192, 132, 252, 0.2), transparent 38%), radial-gradient(circle at 15% 82%, rgba(124, 156, 255, 0.18), transparent 40%), linear-gradient(180deg, #03040c 0%, #070a1c 100%)'
  },
  light: {
    '--bg': '#eef0fb', '--bg-soft': '#f6f3ff', '--surface': 'rgba(255, 255, 255, 0.72)', '--surface-strong': '#ffffff', '--surface-soft': '#eef0fb', '--surface-raised': 'rgba(255, 255, 255, 0.9)',
    '--line': 'rgba(80, 90, 170, 0.16)', '--line-strong': 'rgba(80, 90, 170, 0.28)', '--text': '#161a3a', '--muted': '#5f668f',
    '--accent': '#4f5bd5', '--accent-2': '#9b4dca', '--accent-soft': 'rgba(79, 91, 213, 0.12)', '--success': '#1f8f4d', '--warning': '#a8740a', '--danger': '#d14343',
    '--panel-glow': '0 20px 48px rgba(22, 26, 58, 0.1)',
    '--tint-explorer': '#4f5bd5', '--tint-builder': '#9b4dca', '--tint-results': '#c08a0a', '--tint-activity': '#d0477f',
    '--page-background': 'radial-gradient(circle at 78% 18%, rgba(155, 77, 202, 0.14), transparent 38%), radial-gradient(circle at 15% 82%, rgba(79, 91, 213, 0.14), transparent 40%), linear-gradient(180deg, #eef0fb 0%, #f6f3ff 100%)'
  },
  scenery: {},
  extra: `/* Space: deep floating panels and luminous selection and focus. */
:root[data-theme='space'] .surface {
  box-shadow: var(--panel-glow), 0 0 48px -12px color-mix(in srgb, var(--accent) 30%, transparent);
}

:root[data-theme='space'] :is(.segment-btn.active, .theme-chip.active, .table-item.active, .procedure-item.active, .column-pill.active, .result-tab.active) {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent), 0 0 16px color-mix(in srgb, var(--accent) 28%, transparent);
}

:root[data-theme='space'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn):focus-visible {
  box-shadow: 0 0 0 3px var(--input-focus-ring), 0 0 20px color-mix(in srgb, var(--accent) 45%, transparent);
}`
};

// ── emit ─────────────────────────────────────────────────────────────────────────
const block = (selector, tokens) => `${selector} {\n${Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
let out = `${marker} ═══════════════════════════════════════════════════════════════════════
   Generated by scripts/generate-theme-css.mjs: edit the themes there, not here. Per theme, its structure (fonts, radii, blur) and scenery, then a palette
   for dark and for light mode. Colour tokens are plain colours (not color-mix) so the Theme
   colours pickers can read them. data-theme-tone holds the resolved mode (dark or light). */

/* Background scenery: the theme's living scene (app/theme-scenery.css) plus three fixed
   supporting layers behind the app, each a theme shape (SVG mask) filled with a theme colour.
   --scenery-level is the user's "Background scenery" setting (0 hides it); --scenery-strength is
   how strong a theme's mask layers are at full level. The opacity sits on the layers, not the
   container, so a scene does not get the level applied twice. */
.theme-scenery {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.theme-scenery > span {
  position: absolute;
  inset: 0;
  opacity: calc(var(--scenery-level, 0.4) * var(--scenery-strength, 0.8));
  transition: opacity 260ms ease;
  background: transparent;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

.theme-scenery > .scenery-a {
  background: var(--scenery-a-color, transparent);
  -webkit-mask-image: var(--scenery-a, none);
  mask-image: var(--scenery-a, none);
  -webkit-mask-size: var(--scenery-a-size, auto);
  mask-size: var(--scenery-a-size, auto);
  -webkit-mask-position: var(--scenery-a-position, 0 0);
  mask-position: var(--scenery-a-position, 0 0);
  -webkit-mask-repeat: var(--scenery-a-repeat, no-repeat);
  mask-repeat: var(--scenery-a-repeat, no-repeat);
}

.theme-scenery > .scenery-b {
  background: var(--scenery-b-color, transparent);
  -webkit-mask-image: var(--scenery-b, none);
  mask-image: var(--scenery-b, none);
  -webkit-mask-size: var(--scenery-b-size, auto);
  mask-size: var(--scenery-b-size, auto);
  -webkit-mask-position: var(--scenery-b-position, 0 0);
  mask-position: var(--scenery-b-position, 0 0);
  -webkit-mask-repeat: var(--scenery-b-repeat, no-repeat);
  mask-repeat: var(--scenery-b-repeat, no-repeat);
}

.theme-scenery > .scenery-c {
  background: var(--scenery-c-color, transparent);
  -webkit-mask-image: var(--scenery-c, none);
  mask-image: var(--scenery-c, none);
  -webkit-mask-size: var(--scenery-c-size, auto);
  mask-size: var(--scenery-c-size, auto);
  -webkit-mask-position: var(--scenery-c-position, 0 0);
  mask-position: var(--scenery-c-position, 0 0);
  -webkit-mask-repeat: var(--scenery-c-repeat, no-repeat);
  mask-repeat: var(--scenery-c-repeat, no-repeat);
}

/* A layer with no art for the theme stays empty instead of filling the screen with colour. */
:root:not([data-theme]) .theme-scenery > span {
  display: none;
}

`;

for (const [id, theme] of Object.entries(T)) {
  out += `/* ${theme.title} */\n`;
  const scenery = {};
  ['a', 'b', 'c'].forEach((key) => {
    const l = theme.scenery[key];
    if (!l) {
      scenery[`--scenery-${key}`] = 'none';
      scenery[`--scenery-${key}-color`] = 'transparent';
      return;
    }
    scenery[`--scenery-${key}`] = l.images;
    scenery[`--scenery-${key}-size`] = l.sizes;
    scenery[`--scenery-${key}-position`] = l.positions;
    scenery[`--scenery-${key}-repeat`] = l.repeat;
    scenery[`--scenery-${key}-color`] = theme.scenery[`${key}Color`] || 'var(--accent)';
  });
  scenery['--scenery-strength'] = theme.scenery.strength || '0.85';
  out += block(`:root[data-theme='${id}']`, { ...theme.structure, ...scenery });
  out += '\n' + block(`:root[data-theme='${id}'][data-theme-tone='dark']`, theme.dark);
  out += '\n' + block(`:root[data-theme='${id}'][data-theme-tone='light']`, theme.light);
  if (theme.extra) out += '\n' + theme.extra + '\n';
  out += '\n';
}


out += `
/* Mode buttons and the scenery slider share a row in Settings. */
.appearance-mode-scenery {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 24px;
}

.appearance-mode-scenery .scenery-field {
  flex: 1 1 240px;
  max-width: 420px;
}

.scenery-field input[type="range"] {
  padding: 0;
  min-height: 30px;
  border: 1px solid var(--line);
  background: transparent;
  box-shadow: none;
  accent-color: var(--accent);
}

.scenery-level-value {
  margin-left: 6px;
  color: var(--muted);
  font-weight: 600;
}
`;

css += out;
// primary buttons: text colour from the theme (light accents need dark text)
css = css.replace(/(\.primary-btn \{\n  border: 1px solid transparent;\n  background: linear-gradient\(135deg, var\(--accent\), var\(--accent-2\)\);\n  color: )white;/, '$1var(--on-accent, #ffffff);');
if (!css.includes('color: var(--on-accent, #ffffff);')) throw new Error('primary-btn colour anchor');
fs.writeFileSync(F, css);
console.log(`Theme CSS written (${Math.round(out.length / 1024)} KB).`);
