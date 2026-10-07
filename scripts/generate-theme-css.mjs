// Generates the theme definitions and the background scenery at the end of app/theme.css.
// Run with: node scripts/generate-theme-css.mjs   (edit the themes here, never in theme.css)
// Scenery art is SVG used as CSS masks: only the shape's alpha matters, and the colour comes
// from the theme tokens, so it follows dark/light mode and the user's Theme colours.
import fs from 'fs';
const F = 'app/theme.css';
let css = fs.readFileSync(F, 'utf8').replace(/\r\n/g, '\n');
const marker = '/* ═══ Theme definitions';
const cutAt = css.indexOf(marker);
if (cutAt < 0) throw new Error('marker missing');
css = css.slice(0, cutAt);

const svg = (w, h, body, extra = '') => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'${extra}>${body}</svg>`)}")`;
const round = (n) => Math.round(n * 10) / 10;

// ── art ────────────────────────────────────────────────────────────────────────────
const leaf = (x, y, angle, len = 70, width = 18, opacity = 0.85) =>
  `<path transform='translate(${x} ${y}) rotate(${angle})' d='M0 0 C ${len * 0.25} ${-width}, ${len * 0.75} ${-width}, ${len} 0 C ${len * 0.75} ${width}, ${len * 0.25} ${width}, 0 0 Z' fill-opacity='${opacity}'/>`;
const sparkle = (x, y, r, opacity = 0.9) =>
  `<path transform='translate(${x} ${y})' d='M0 ${-r} C ${r * 0.18} ${-r * 0.18}, ${r * 0.18} ${-r * 0.18}, ${r} 0 C ${r * 0.18} ${r * 0.18}, ${r * 0.18} ${r * 0.18}, 0 ${r} C ${-r * 0.18} ${r * 0.18}, ${-r * 0.18} ${r * 0.18}, ${-r} 0 C ${-r * 0.18} ${-r * 0.18}, ${-r * 0.18} ${-r * 0.18}, 0 ${-r} Z' fill-opacity='${opacity}'/>`;
const flower = (x, y, r, opacity = 0.8) => {
  const petals = [0, 72, 144, 216, 288].map((a) => {
    const rad = (a * Math.PI) / 180;
    return `<circle cx='${round(x + Math.cos(rad) * r)}' cy='${round(y + Math.sin(rad) * r)}' r='${round(r * 0.75)}' fill-opacity='${opacity}'/>`;
  }).join('');
  return `${petals}<circle cx='${x}' cy='${y}' r='${round(r * 0.55)}' fill-opacity='1'/>`;
};
const cloud = (x, y, s, opacity = 0.75) =>
  `<g transform='translate(${x} ${y}) scale(${s})' fill-opacity='${opacity}'><circle cx='40' cy='40' r='26'/><circle cx='75' cy='28' r='32'/><circle cx='110' cy='42' r='24'/><rect x='14' y='40' width='120' height='26' rx='13'/></g>`;
const stars = (count, w, h, seed, rMin, rMax) => {
  let state = seed;
  const rand = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += `<circle cx='${round(rand() * w)}' cy='${round(rand() * h)}' r='${round(rMin + rand() * (rMax - rMin))}' fill-opacity='${round(0.35 + rand() * 0.65)}'/>`;
  }
  return out;
};

const ART = {
  spacePlanet: svg(520, 520, `
    <circle cx='300' cy='220' r='230' fill='none' stroke='black' stroke-opacity='.16' stroke-width='1.5' stroke-dasharray='3 10'/>
    <circle cx='300' cy='220' r='92' fill-opacity='.85'/>
    <circle cx='278' cy='196' r='92' fill-opacity='.25'/>
    <ellipse cx='300' cy='220' rx='176' ry='36' fill='none' stroke='black' stroke-opacity='.6' stroke-width='8' transform='rotate(-16 300 220)'/>
    <circle cx='96' cy='84' r='17' fill-opacity='.7'/>
    <circle cx='470' cy='452' r='9' fill-opacity='.55'/>`),
  spaceGalaxy: svg(560, 560, `
    <g transform='translate(280 280)'>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse rx='${50 + i * 40}' ry='${14 + i * 12}' fill='none' stroke='black' stroke-opacity='${round(0.55 - i * 0.08)}' stroke-width='${7 - i}' transform='rotate(${i * 26})'/>`).join('')}
      <circle r='26' fill-opacity='.9'/><circle r='52' fill-opacity='.25'/>
    </g>
    ${stars(18, 560, 560, 7, 1, 2.6)}`),
  spaceStars: svg(320, 280, `${stars(16, 320, 280, 3, 0.7, 1.7)}${sparkle(240, 60, 5, 0.9)}${sparkle(70, 210, 4, 0.75)}`),
  gardenBranch: svg(520, 520, `
    <path d='M30 510 C 120 390, 190 300, 330 140' fill='none' stroke='black' stroke-opacity='.75' stroke-width='6' stroke-linecap='round'/>
    ${leaf(70, 450, -95, 80, 20)}${leaf(78, 444, -15, 80, 20)}
    ${leaf(130, 375, -100, 90, 22)}${leaf(140, 368, -25, 88, 22)}
    ${leaf(195, 300, -105, 92, 22)}${leaf(206, 292, -32, 90, 22)}
    ${leaf(262, 222, -110, 84, 20)}${leaf(272, 214, -40, 82, 20)}
    ${leaf(320, 152, -70, 70, 18)}`),
  gardenBranchFlip: svg(520, 520, `<g transform='translate(520 520) rotate(180)'>
    <path d='M30 510 C 120 390, 190 300, 330 140' fill='none' stroke='black' stroke-opacity='.75' stroke-width='6' stroke-linecap='round'/>
    ${leaf(70, 450, -95, 80, 20)}${leaf(78, 444, -15, 80, 20)}
    ${leaf(130, 375, -100, 90, 22)}${leaf(140, 368, -25, 88, 22)}
    ${leaf(195, 300, -105, 92, 22)}${leaf(206, 292, -32, 90, 22)}</g>`),
  gardenBlooms: svg(460, 400, `${flower(80, 90, 9)}${flower(340, 250, 7, 0.7)}
    <path d='M220 380 C 220 350, 222 330, 226 310' stroke='black' stroke-width='3' fill='none' stroke-opacity='.7'/>${leaf(226, 330, -150, 28, 9, 0.8)}${leaf(224, 322, -30, 28, 9, 0.8)}`),
  cottageSprig: svg(480, 480, `
    <path d='M20 470 C 90 400, 130 330, 150 240 M90 400 C 140 380, 190 370, 240 330 M130 330 C 90 290, 70 250, 66 200' fill='none' stroke='black' stroke-opacity='.7' stroke-width='4' stroke-linecap='round'/>
    ${leaf(60, 430, -120, 46, 12)}${leaf(120, 384, -10, 46, 12)}${leaf(180, 366, -20, 42, 11)}${leaf(100, 300, -150, 40, 11)}
    ${flower(150, 236, 10)}${flower(242, 328, 9)}${flower(66, 196, 8)}`),
  cottageMushrooms: svg(420, 320, `
    <path d='M80 300 L 80 230 Q 80 214 96 214 L 112 214 Q 128 214 128 230 L 128 300 Z' fill-opacity='.7'/>
    <path d='M30 222 C 30 150, 178 150, 178 222 Z' fill-opacity='.9'/>
    <circle cx='80' cy='190' r='8' fill-opacity='.35'/><circle cx='122' cy='180' r='6' fill-opacity='.35'/>
    <path d='M250 300 L 250 262 Q 250 252 260 252 L 268 252 Q 278 252 278 262 L 278 300 Z' fill-opacity='.7'/>
    <path d='M222 256 C 222 210, 306 210, 306 256 Z' fill-opacity='.9'/>
    <path d='M350 300 L 350 280 Q 350 274 356 274 L 360 274 Q 366 274 366 280 L 366 300 Z' fill-opacity='.7'/>
    <path d='M336 278 C 336 252, 380 252, 380 278 Z' fill-opacity='.9'/>`),
  pastelClouds: svg(520, 300, `${cloud(10, 120, 1.6)}${cloud(300, 40, 1.1, 0.6)}`),
  pastelSparkles: svg(380, 340, `${sparkle(60, 60, 10)}${sparkle(300, 120, 7, 0.8)}${sparkle(180, 280, 6, 0.7)}
    <path transform='translate(320 270) scale(.9)' d='M0 8 C 0 -4, 16 -4, 16 8 C 16 -4, 32 -4, 32 8 C 32 20, 16 28, 16 34 C 16 28, 0 20, 0 8 Z' fill-opacity='.75'/>`),
  cyberFloor: svg(1200, 360, `
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const y = round(360 - 360 * Math.pow(0.68, i)); return `<line x1='0' y1='${y}' x2='1200' y2='${y}' stroke='black' stroke-opacity='${round(0.9 - i * 0.09)}' stroke-width='2'/>`; }).join('')}
    ${Array.from({ length: 17 }, (_, i) => `<line x1='600' y1='0' x2='${round(-600 + i * 150)}' y2='360' stroke='black' stroke-opacity='.7' stroke-width='2'/>`).join('')}`, " preserveAspectRatio='none'"),
  cyberSun: svg(900, 420, `
    <defs><mask id='m'><rect width='900' height='420' fill='white'/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x='0' y='${190 + i * 26}' width='900' height='${4 + i * 2}' fill='black'/>`).join('')}</mask></defs>
    <circle cx='450' cy='230' r='170' fill-opacity='.95' mask='url(#m)'/>
    <path d='M0 420 L0 330 L60 330 L60 290 L110 290 L110 350 L170 350 L170 270 L220 270 L220 320 L300 320 L300 360 L360 360 L360 300 L400 300 L400 380 L500 380 L500 310 L560 310 L560 260 L620 260 L620 340 L700 340 L700 290 L760 290 L760 350 L830 350 L830 300 L900 300 L900 420 Z' fill-opacity='.4'/>`),
  neonWavesLow: svg(1200, 260, `
    <path d='M0 170 C 150 110, 300 230, 450 170 S 750 110, 900 170 S 1100 230, 1200 170' fill='none' stroke='black' stroke-width='3' stroke-opacity='.9'/>
    <path d='M0 210 C 200 160, 350 260, 600 205 S 950 150, 1200 210' fill='none' stroke='black' stroke-width='2' stroke-opacity='.55'/>`, " preserveAspectRatio='none'"),
  neonWavesHigh: svg(1200, 220, `
    <path d='M0 60 C 200 110, 400 10, 600 60 S 1000 110, 1200 50' fill='none' stroke='black' stroke-width='2.5' stroke-opacity='.8'/>`, " preserveAspectRatio='none'"),
  glassBubbles: svg(460, 460, `
    <circle cx='120' cy='130' r='86' fill-opacity='.14' stroke='black' stroke-opacity='.55' stroke-width='3'/>
    <path d='M70 90 A 70 70 0 0 1 130 64' fill='none' stroke='black' stroke-opacity='.8' stroke-width='6' stroke-linecap='round'/>
    <circle cx='300' cy='300' r='54' fill-opacity='.12' stroke='black' stroke-opacity='.45' stroke-width='3'/>
    <circle cx='380' cy='140' r='24' fill-opacity='.12' stroke='black' stroke-opacity='.4' stroke-width='2'/>
    <circle cx='200' cy='390' r='16' fill-opacity='.12' stroke='black' stroke-opacity='.35' stroke-width='2'/>`),
  glassArcs: svg(600, 600, `
    <circle cx='600' cy='300' r='260' fill='none' stroke='black' stroke-opacity='.35' stroke-width='22'/>
    <circle cx='600' cy='300' r='200' fill='none' stroke='black' stroke-opacity='.2' stroke-width='10'/>`),
  minimalCircle: svg(520, 520, `
    <circle cx='300' cy='220' r='190' fill='none' stroke='black' stroke-width='1.5' stroke-opacity='.8'/>
    <line x1='40' y1='420' x2='500' y2='420' stroke='black' stroke-width='1.5' stroke-opacity='.6'/>`),
  minimalDots: svg(220, 220, Array.from({ length: 36 }, (_, i) => `<circle cx='${20 + (i % 6) * 36}' cy='${20 + Math.floor(i / 6) * 36}' r='2' fill-opacity='.8'/>`).join('')),
  neuShapes: svg(520, 520, `
    <rect x='250' y='250' width='220' height='220' rx='56' fill='none' stroke='black' stroke-opacity='.55' stroke-width='3'/>
    <rect x='290' y='290' width='140' height='140' rx='36' fill='none' stroke='black' stroke-opacity='.35' stroke-width='3'/>
    <circle cx='140' cy='140' r='80' fill='none' stroke='black' stroke-opacity='.45' stroke-width='3'/>
    <circle cx='140' cy='140' r='46' fill='none' stroke='black' stroke-opacity='.3' stroke-width='3'/>`),
  oledHorizon: svg(1200, 300, `
    <path d='M-100 300 Q 600 120 1300 300' fill='none' stroke='black' stroke-width='3' stroke-opacity='.9'/>
    <path d='M-100 300 Q 600 150 1300 300' fill='none' stroke='black' stroke-width='14' stroke-opacity='.18'/>`, " preserveAspectRatio='none'"),
  oledDots: svg(240, 240, stars(9, 240, 240, 11, 0.8, 1.6))
};

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
  scenery: {
    a: layer(`${ART.glassBubbles}, ${ART.glassBubbles}`, '440px, 300px', 'right -40px bottom -60px, left 4% top 14%'),
    b: layer(ART.glassArcs, '560px', 'right -300px top 10%'),
    aColor: 'var(--accent)', bColor: 'var(--accent-2)'
  }
};

T.oled = {
  title: 'Dark & OLED Black — true black for low light, with muted pastel accents.',
  structure: { '--surface-blur': '0px', '--orb-opacity': '0', '--radius-xl': '18px', '--radius-lg': '14px', '--radius-md': '10px', '--font-heading': "'Space Grotesk', 'Sora', sans-serif", '--heading-tracking': '-0.01em' },
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
  scenery: {
    a: layer(ART.oledHorizon, '100% 34vh', 'center bottom'),
    b: layer(`${ART.oledDots}, ${ART.oledDots}`, '240px, 200px', 'right 6% top 8%, left 10% bottom 22%'),
    aColor: 'var(--accent)', bColor: 'var(--text)'
  }
};

T.neon = {
  title: 'Matte Dark & Neon — flat matte surfaces, no blur, thin neon lines and glowing accents.',
  structure: { '--radius-xl': '16px', '--radius-lg': '12px', '--radius-md': '9px', '--font-heading': "'Space Grotesk', 'Sora', sans-serif", '--heading-tracking': '0', '--surface-blur': '0px', '--orb-opacity': '0' },
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
  scenery: {
    a: layer(ART.neonWavesLow, '100% 26vh', 'center bottom'),
    b: layer(ART.neonWavesHigh, '100% 20vh', 'center top 6vh'),
    aColor: 'var(--accent)', bColor: 'var(--accent-2)'
  },
  extra: `:root[data-theme='neon'][data-theme-tone='dark'] :is(h1, h2) {
  text-shadow: 0 0 14px color-mix(in srgb, var(--accent) 45%, transparent);
}

:root[data-theme='neon'] .primary-btn {
  box-shadow: 0 0 0 1px var(--accent), 0 0 18px color-mix(in srgb, var(--accent) 40%, transparent);
}`
};

T.minimal = {
  title: 'Minimal / Digital Detox — white space, monochrome, no shadows, blur or decoration.',
  structure: { '--radius-xl': '14px', '--radius-lg': '10px', '--radius-md': '8px', '--font-heading': "'Manrope', sans-serif", '--heading-tracking': '-0.01em', '--surface-blur': '0px', '--orb-opacity': '0', '--panel-glow': 'none', '--glass-highlight': 'transparent', '--glass-shade': 'transparent' },
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
  scenery: {
    a: layer(ART.minimalCircle, '520px', 'right -120px top -100px'),
    b: layer(ART.minimalDots, '220px', 'left 3% bottom 4%'),
    aColor: 'var(--muted)', bColor: 'var(--muted)', strength: '0.6'
  },
  extra: `:root[data-theme='minimal'] .eyebrow {
  color: var(--muted);
}

:root[data-theme='minimal'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .icon-btn, .save-conn-btn, .text-btn, .theme-chip, .table-item, .procedure-item, .saved-item-main, .history-item, .result-tab, .column-pill, .surface) {
  box-shadow: none;
}`
};

T.neumorphic = {
  title: 'Neomorphic / Soft 3D — panels and buttons look gently pressed out of the page, with soft light and shade.',
  structure: { '--radius-xl': '26px', '--radius-lg': '20px', '--radius-md': '14px', '--font-heading': "'Manrope', sans-serif", '--heading-tracking': '-0.01em', '--surface-blur': '0px', '--orb-opacity': '0' },
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
  scenery: {
    a: layer(`${ART.neuShapes}, ${ART.neuShapes}`, '460px, 300px', 'right -120px bottom -120px, left -80px top 10%'),
    aColor: 'var(--muted)', strength: '0.55'
  },
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
  scenery: {
    a: layer(`${ART.pastelClouds}, ${ART.pastelClouds}`, '480px, 340px', 'left -60px bottom -30px, right -40px top 4%'),
    b: layer(ART.pastelSparkles, '380px 340px', '0 0', 'repeat'),
    aColor: 'var(--accent-2)', bColor: 'var(--accent)', strength: '0.75'
  },
  extra: `:root[data-theme='pastel'] :is(.primary-btn, .secondary-btn, .ghost-btn, .segment-btn, .save-conn-btn) {
  border-radius: 999px;
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
  scenery: {
    a: layer(ART.cyberFloor, '100% 32vh', 'center bottom'),
    b: layer(ART.cyberSun, 'min(820px, 70vw) auto', 'center bottom 22vh'),
    aColor: 'var(--accent-2)', bColor: 'var(--accent)', strength: '0.65'
  },
  extra: `:root[data-theme='cyberpunk'] :is(h1, h2) {
  text-shadow: 2px 0 0 color-mix(in srgb, var(--accent) 55%, transparent), -2px 0 0 color-mix(in srgb, var(--accent-2) 45%, transparent);
}

:root[data-theme='cyberpunk'] .eyebrow {
  font-family: 'IBM Plex Mono', monospace;
  color: var(--accent-2);
}

:root[data-theme='cyberpunk'] .surface {
  border-color: var(--line-strong);
}`
};

T.cottagecore = {
  title: 'Cottagecore & Organic — warm paper, sage and terracotta, serif headings, wildflowers and mushrooms.',
  structure: { '--radius-xl': '22px', '--radius-lg': '16px', '--radius-md': '12px', '--font-heading': "Georgia, Cambria, 'Times New Roman', serif", '--heading-tracking': '0', '--surface-blur': '8px', '--orb-opacity': '0.3' },
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
  scenery: {
    a: layer(`${ART.cottageSprig}, ${ART.cottageSprig}`, '420px, 300px', 'left -40px bottom -30px, right 2% top 2%'),
    b: layer(ART.cottageMushrooms, '360px', 'right 3% bottom 0'),
    aColor: 'var(--accent)', bColor: 'var(--accent-2)', strength: '0.75'
  },
  extra: `:root[data-theme='cottagecore'] body {
  background-size: 18px 18px, auto, auto;
}`
};

T.garden = {
  title: 'Garden / Botanical — organic greens with earth accents: calm cream and sage by day, moody forest with lime by night.',
  structure: { '--radius-xl': '26px', '--radius-lg': '20px', '--radius-md': '14px', '--font-heading': "'Manrope', sans-serif", '--heading-tracking': '-0.015em', '--surface-blur': '10px', '--orb-opacity': '0.35' },
  dark: {
    '--bg': '#070d09', '--bg-soft': '#0c1710', '--surface': 'rgba(14, 26, 18, 0.88)', '--surface-strong': '#102016', '--surface-soft': '#17291d', '--surface-raised': 'rgba(18, 32, 22, 0.95)',
    '--line': 'rgba(132, 255, 120, 0.12)', '--line-strong': 'rgba(132, 255, 120, 0.24)', '--text': '#e6f4e6', '--muted': '#8fa892',
    '--accent': '#7cff5a', '--accent-2': '#2dd4a0', '--accent-soft': 'rgba(124, 255, 90, 0.14)', '--success': '#7cff5a', '--warning': '#e8d44d', '--danger': '#ff6b5b',
    '--on-accent': '#07160a', '--panel-glow': '0 20px 48px rgba(0, 0, 0, 0.45)',
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
  scenery: {
    a: layer(`${ART.gardenBranch}, ${ART.gardenBranchFlip}`, '480px, 380px', 'left -40px bottom -40px, right -30px top -20px'),
    b: layer(ART.gardenBlooms, '460px 400px', '120px 40px', 'repeat'),
    aColor: 'var(--accent)', bColor: 'var(--accent-2)', strength: '0.7'
  }
};

T.space = {
  title: 'Space — a night sky with stars, a ringed planet and a spiral galaxy; a pale celestial sky in light mode.',
  structure: { '--heading-tracking': '0.01em', '--surface-blur': '3px', '--orb-opacity': '0.5' },
  dark: {
    '--bg': '#03040c', '--bg-soft': '#070a1c', '--surface': 'rgba(10, 14, 34, 0.74)', '--surface-strong': '#0f1430', '--surface-soft': '#161d42', '--surface-raised': 'rgba(16, 22, 50, 0.92)',
    '--line': 'rgba(150, 170, 255, 0.16)', '--line-strong': 'rgba(150, 170, 255, 0.3)', '--text': '#eef1ff', '--muted': '#9aa3c7',
    '--accent': '#7c9cff', '--accent-2': '#c084fc', '--accent-soft': 'rgba(124, 156, 255, 0.18)', '--success': '#4ade80', '--warning': '#fbbf24', '--danger': '#f87171',
    '--panel-glow': '0 24px 60px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(124, 156, 255, 0.06)',
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
  scenery: {
    a: layer(ART.spacePlanet, '500px', 'right -110px top -70px'),
    b: layer(ART.spaceGalaxy, '540px', 'left -140px bottom -150px'),
    c: layer(ART.spaceStars, '320px 280px', '0 0', 'repeat'),
    aColor: 'var(--accent)', bColor: 'var(--accent-2)', cColor: 'var(--text)', strength: '1'
  }
};

// ── emit ─────────────────────────────────────────────────────────────────────────
const block = (selector, tokens) => `${selector} {\n${Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
let out = `${marker} ═══════════════════════════════════════════════════════════════════════
   Generated by scripts/generate-theme-css.mjs: edit the themes there, not here. Per theme, its structure (fonts, radii, blur) and scenery, then a palette
   for dark and for light mode. Colour tokens are plain colours (not color-mix) so the Theme
   colours pickers can read them. data-theme-tone holds the resolved mode (dark or light). */

/* Background scenery: three fixed layers behind the app, each a theme shape (SVG mask) filled
   with a theme colour. --scenery-level is the user's "Background scenery" setting (0 hides it);
   --scenery-strength is how strong each theme's art is at full level. */
.theme-scenery {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: calc(var(--scenery-level, 0.4) * var(--scenery-strength, 0.8));
  transition: opacity 260ms ease;
}

.theme-scenery > span {
  position: absolute;
  inset: 0;
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

out += `/* Space: the stars drift very slowly when ambient motion is on. */
@media (prefers-reduced-motion: no-preference) {
  :root[data-theme='space'][data-ambient-motion='enabled'] .theme-scenery > .scenery-c {
    animation: scenery-drift 240s linear infinite;
  }
}

@keyframes scenery-drift {
  from { -webkit-mask-position: 0 0; mask-position: 0 0; }
  to { -webkit-mask-position: -320px 280px; mask-position: -320px 280px; }
}
`;

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
