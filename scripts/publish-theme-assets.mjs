// Builds public/themes/ — the artwork the app actually ships — from the cut library in
// design/themes/extracted/ (run scripts/extract-theme-assets.mjs first), and writes
// public/themes/ASSET-MANIFEST.md.
//
//   node scripts/publish-theme-assets.mjs
//
// The shipped set is read from the scenery code itself, never kept as a separate list: every
// light="…"/dark="…" layer in app/components/theme-scenery.js and every url('/themes/….webp') in
// app/theme-scenery.css. Anything else under public/themes/ is deleted, so an asset dropped from
// a scene stops shipping on the next run.
//
// Every asset ships as WebP at its original size. High-quality lossy (q95) is used only where it
// is indistinguishable once composited: 99.9% of pixels within 20/255 of the master and none off
// by more than 80. Hard-edged neon and very fine detail fail that and ship near-lossless instead,
// which stays within 2/255 of the master everywhere. Alpha is kept at full quality in both.
import fs from 'fs';
import path from 'path';
import { THEME_ASSETS } from './theme-assets.config.mjs';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  throw new Error('sharp is not installed. Run npm ci; Next installs it.');
}

const LIBRARY = path.join('design', 'themes', 'extracted');
const OUT_DIR = path.join('public', 'themes');
const LOSSY = { quality: 95, alphaQuality: 100, effort: 6, smartSubsample: true };
const NEAR_LOSSLESS = { nearLossless: true, quality: 80, effort: 6 };
const LOSSY_P999 = 20;
const LOSSY_MAX = 80;

// Which assets the scenery references, and in which tone. A layer with only light="…" shows in
// both tones; in the CSS, a url under a [data-theme-tone='dark'] rule is the dark art.
function referencedAssets() {
  const uses = new Map();
  const add = (asset, tone) => {
    const set = uses.get(asset) || new Set();
    set.add(tone);
    uses.set(asset, set);
  };
  const js = fs.readFileSync(path.join('app', 'components', 'theme-scenery.js'), 'utf8');
  for (const tag of js.matchAll(/<Art\b[^>]*>/g)) {
    const light = tag[0].match(/\blight="([a-z0-9-]+\/[a-z0-9-]+)"/)?.[1];
    const dark = tag[0].match(/\bdark="([a-z0-9-]+\/[a-z0-9-]+)"/)?.[1];
    if (light) add(light, dark ? 'Light' : 'Light and dark');
    if (dark) add(dark, 'Dark');
  }
  const css = fs.readFileSync(path.join('app', 'theme-scenery.css'), 'utf8');
  for (const line of css.split('\n')) {
    for (const m of line.matchAll(/url\('\/themes\/([a-z0-9-]+\/[a-z0-9-]+)\.webp'\)/g)) {
      add(m[1], line.includes("data-theme-tone='dark'") ? 'Dark' : 'Light');
    }
  }
  return uses;
}

// Error once composited: premultiplied colour, which is what reaches the screen.
function compositeError(a, b) {
  const hist = new Uint32Array(256);
  let n = 0;
  let max = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] === 0 && b[i + 3] === 0) continue;
    for (let c = 0; c < 3; c += 1) {
      const e = Math.abs(a[i + c] * a[i + 3] - b[i + c] * b[i + 3]) / 255;
      hist[Math.min(255, Math.round(e))] += 1;
      n += 1;
      if (e > max) max = e;
    }
  }
  let seen = 0;
  for (let v = 0; v < 256; v += 1) {
    seen += hist[v];
    if (seen >= n * 0.999) return { p999: v, max: Math.round(max) };
  }
  return { p999: 255, max: Math.round(max) };
}

async function encode(source) {
  const master = await sharp(source).ensureAlpha().raw().toBuffer();
  const lossy = await sharp(source).webp(LOSSY).toBuffer();
  const error = compositeError(master, await sharp(lossy).ensureAlpha().raw().toBuffer());
  if (error.p999 <= LOSSY_P999 && error.max <= LOSSY_MAX) return { data: lossy, encoding: 'WebP lossy q95, alpha lossless', error };
  return { data: await sharp(source).webp(NEAR_LOSSLESS).toBuffer(), encoding: 'WebP near-lossless (within 2/255)', error };
}

const configFor = {};
for (const config of Object.values(THEME_ASSETS)) {
  for (const asset of config.assets) configFor[`${config.dir}/${asset.name}`] = { config, asset };
}

const uses = referencedAssets();
const missing = [...uses.keys()].filter((a) => !fs.existsSync(path.join(LIBRARY, `${a}.png`)));
if (missing.length) throw new Error(`Not in ${LIBRARY} (run scripts/extract-theme-assets.mjs all): ${missing.join(', ')}`);

const shipped = [];
for (const asset of [...uses.keys()].sort()) {
  const source = path.join(LIBRARY, `${asset}.png`);
  const out = path.join(OUT_DIR, `${asset}.webp`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { data, encoding, error } = await encode(source);
  fs.writeFileSync(out, data);
  const meta = await sharp(source).metadata();
  shipped.push({ asset, encoding, error, bytes: data.length, pngBytes: fs.statSync(source).size, width: meta.width, height: meta.height, tones: [...uses.get(asset)].join(', ') });
  console.log(`${asset}.webp ${meta.width}x${meta.height} ${(fs.statSync(source).size / 1024).toFixed(0)}KB -> ${(data.length / 1024).toFixed(0)}KB  ${encoding}`);
}

// Remove everything the scenery no longer references, including stale formats.
const keep = new Set(shipped.map((s) => path.join(OUT_DIR, `${s.asset}.webp`)));
for (const entry of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
  const full = path.join(OUT_DIR, entry.name);
  if (!entry.isDirectory()) continue;
  for (const file of fs.readdirSync(full)) {
    if (!keep.has(path.join(full, file))) fs.unlinkSync(path.join(full, file));
  }
  if (!fs.readdirSync(full).length) fs.rmdirSync(full);
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const total = shipped.reduce((s, a) => s + a.bytes, 0);
const lines = [
  '# Theme asset manifest',
  '',
  'The artwork the app ships, and nothing else. Generated by `node scripts/publish-theme-assets.mjs`',
  'from the scenery code (`app/components/theme-scenery.js`, `app/theme-scenery.css`); do not edit',
  'this file. The masters are `design/asset-sheets/` and `design/themes/signature-assets/`; the full',
  'cut library is rebuilt from them into `design/themes/extracted/` by',
  '`node scripts/extract-theme-assets.mjs all`.',
  '',
  `${shipped.length} assets, ${kb(total)}. Every file is WebP at the master's own size. Lossy q95 is used`,
  `only where 99.9% of composited pixels stay within ${LOSSY_P999}/255 of the master and none is off by more`,
  `than ${LOSSY_MAX}; the rest are near-lossless, within 2/255 everywhere. Alpha is never reduced.`,
  ''
];
for (const config of Object.values(THEME_ASSETS)) {
  const own = shipped.filter((s) => s.asset.startsWith(`${config.dir}/`));
  if (!own.length) continue;
  lines.push(`## ${config.title}`, '', `${own.length} assets, ${kb(own.reduce((s, a) => s + a.bytes, 0))}.`, '');
  for (const s of own) {
    const { asset } = configFor[s.asset] || { asset: {} };
    lines.push(`### ${s.asset}.webp`, '');
    lines.push(`- Shown in: ${s.tones}`);
    lines.push(`- Size: ${s.width}×${s.height} px, ${kb(s.bytes)} (master PNG ${kb(s.pngBytes)})`);
    lines.push(`- Encoding: ${s.encoding}`);
    if (asset.role) lines.push(`- Role: ${asset.role}`);
    if (asset.motion) lines.push(`- Motion: ${asset.motion}`);
    if (asset.mobile) lines.push(`- Mobile: ${asset.mobile}`);
    lines.push(asset.signature
      ? `- Source: high-resolution dedicated generation, \`design/themes/signature-assets/${asset.signature}\``
      : `- Source: cut from \`design/asset-sheets/${config.sheet}\``);
    lines.push('');
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'ASSET-MANIFEST.md'), lines.join('\n'));
console.log(`${shipped.length} assets, ${(total / 1e6).toFixed(2)} MB`);
