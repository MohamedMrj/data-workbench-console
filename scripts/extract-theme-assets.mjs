// Cuts the transparent theme asset sheets in design/asset-sheets/ into individual, tightly
// cropped PNGs under public/themes/<theme>/ and writes public/themes/ASSET-MANIFEST.md.
//
//   node scripts/extract-theme-assets.mjs <theme|all>                  extract (and rewrite the manifest)
//   node scripts/extract-theme-assets.mjs <theme|all> --preview <dir>  only draw the detected groups
//
// Assets are found from the alpha channel, never from hand-made crop rectangles. The config in
// theme-assets.config.mjs only names them, by a point inside each one, and cuts apart the few
// objects that touch on the sheet. Requires sharp, which Next already installs (pinned in
// package.json overrides); no new dependency.
import fs from 'fs';
import path from 'path';
import { THEME_ASSETS } from './theme-assets.config.mjs';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  throw new Error('sharp is not installed. Run npm ci; Next installs it.');
}

const SHEET_DIR = path.join('design', 'asset-sheets');
const OUT_DIR = path.join('public', 'themes');

// Detection sees only clearly painted pixels. The sheets carry a wide alpha 1-3 matting haze
// round every object that touches its neighbours, so detecting on it would fuse the whole sheet.
// Sheets with broad glows (Space) raise it per sheet; the glow is still exported, through the
// territory below, it just no longer bridges two objects.
const DETECT_ALPHA = 24;
// The crop keeps everything down to alpha 4 (1.6% opacity), which holds every soft glow; the
// 1-3 haze beyond that is invisible and is the only thing left behind.
const CROP_ALPHA = 4;
const PADDING = 6;
// How far a faint pixel (glow, halo) may lie from its object and still belong to it; a sheet
// with broad glows raises it.
const TERRITORY = 48;
// How far an isolated speck (not connected to anything by visible pixels) may be from an object.
const ISOLATED_REACH = 24;

async function loadSheet(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function coreMask({ data, width, height }, threshold) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3] >= threshold ? 1 : 0;
  return mask;
}

// Square dilation by radius r, as two running-window passes.
function dilate(mask, width, height, r) {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    const row = y * width;
    for (let x = -r; x < width; x += 1) {
      const add = x + r;
      if (add < width) count += mask[row + add];
      const drop = x - r - 1;
      if (drop >= 0) count -= mask[row + drop];
      if (x >= 0) tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = -r; y < height; y += 1) {
      const add = y + r;
      if (add < height) count += tmp[add * width + x];
      const drop = y - r - 1;
      if (drop >= 0) count -= tmp[drop * width + x];
      if (y >= 0) out[y * width + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

// Sets a line of the given thickness to `value`: clearing it in the detection mask lets two
// objects that touch on the sheet group apart, and marking it in the wall mask keeps their glow
// apart too.
function cut(mask, width, height, [x1, y1, x2, y2, thickness = 3], value = 0) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  const half = Math.floor(thickness / 2);
  for (let s = 0; s <= steps; s += 1) {
    const cx = Math.round(x1 + ((x2 - x1) * s) / steps);
    const cy = Math.round(y1 + ((y2 - y1) * s) / steps);
    for (let dy = -half; dy <= half; dy += 1) {
      for (let dx = -half; dx <= half; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = value;
      }
    }
  }
}

function label(mask, width, height) {
  const parent = new Int32Array(mask.length).fill(-1);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      parent[i] = i;
      if (x > 0 && mask[i - 1]) join(i, i - 1);
      if (y > 0) {
        if (mask[i - width]) join(i, i - width);
        if (x > 0 && mask[i - width - 1]) join(i, i - width - 1);
        if (x < width - 1 && mask[i - width + 1]) join(i, i - width + 1);
      }
    }
  }
  const labels = new Int32Array(mask.length);
  const ids = new Map();
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const root = find(i);
    if (!ids.has(root)) ids.set(root, ids.size + 1);
    labels[i] = ids.get(root);
  }
  return { labels, count: ids.size };
}

// Groups the painted pixels: pieces within groupDistance of each other form one object, unless
// a configured cut runs between them.
function detectGroups(sheet, config) {
  const { width, height } = sheet;
  const core = coreMask(sheet, config.detectAlpha ?? DETECT_ALPHA);
  const grown = dilate(core, width, height, Math.ceil((config.groupDistance ?? 10) / 2));
  for (const line of config.cuts || []) cut(grown, width, height, line);
  const { labels, count } = label(grown, width, height);
  const groupOf = new Int32Array(core.length);
  const groups = Array.from({ length: count + 1 }, (_, id) => ({ id, area: 0, x0: width, y0: height, x1: -1, y1: -1, sx: 0, sy: 0 }));
  for (let i = 0; i < core.length; i += 1) {
    if (!core[i] || !labels[i]) continue;
    const g = groups[labels[i]];
    groupOf[i] = g.id;
    const x = i % width;
    const y = (i - x) / width;
    g.area += 1;
    g.sx += x;
    g.sy += y;
    if (x < g.x0) g.x0 = x;
    if (y < g.y0) g.y0 = y;
    if (x > g.x1) g.x1 = x;
    if (y > g.y1) g.y1 = y;
  }
  return { groupOf, groups: groups.filter((g) => g.area > 0).map((g) => ({ ...g, cx: Math.round(g.sx / g.area), cy: Math.round(g.sy / g.area) })) };
}

// Spreads ownership breadth-first from every owned pixel at once, into unowned pixels that
// pass `enter`, up to `reach` steps.
function spread(owner, width, reach, enter) {
  const dist = new Uint16Array(owner.length).fill(65535);
  const queue = new Int32Array(owner.length);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i]) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const d = dist[i] + 1;
    if (d > reach) continue;
    const x = i % width;
    const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
    for (const n of neighbours) {
      if (n < 0 || n >= owner.length || dist[n] <= d || (owner[n] && dist[n] === 0) || !enter(n)) continue;
      dist[n] = d;
      owner[n] = owner[i];
      queue[tail++] = n;
    }
  }
}

// Gives the faint pixels (glow, halo, dust) to an object. First along visible pixels only, so a
// glow belongs to the object it is connected to rather than whichever core is nearest (an
// asteroid belt's dust tail must not go to a small planet below it); cut lines are walls here
// too. Then, over a short reach and across anything, the few isolated specks left over.
function claimTerritory(sheet, groupOf, reach, walls) {
  const { data, width } = sheet;
  const owner = Int32Array.from(groupOf);
  spread(owner, width, reach, (n) => data[n * 4 + 3] > 0 && !walls[n]);
  spread(owner, width, ISOLATED_REACH, () => true);
  return owner;
}

function nearestGroup(groupOf, width, height, [px, py], radius = 40) {
  for (let r = 0; r <= radius; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const g = groupOf[y * width + x];
        if (g) return g;
      }
    }
  }
  return 0;
}

// Resolves configured names to groups. Every group must end up named, skipped or attached as a
// stray, so nothing on a sheet is silently dropped.
function assign(theme, config, sheet, detected) {
  const { width, height } = sheet;
  const byGroup = new Map();
  const problems = [];
  for (const asset of config.assets) {
    const points = Array.isArray(asset.at[0]) ? asset.at : [asset.at];
    for (const point of points) {
      const g = nearestGroup(detected.groupOf, width, height, point);
      if (!g) problems.push(`${asset.name}: nothing painted near ${point.join(',')}`);
      else if (byGroup.has(g) && byGroup.get(g) !== asset.name) problems.push(`${asset.name} and ${byGroup.get(g)} are one group (#${g}); add a cut between them`);
      else byGroup.set(g, asset.name);
    }
  }
  for (const point of config.skip || []) {
    const g = nearestGroup(detected.groupOf, width, height, point);
    if (g && !byGroup.has(g)) byGroup.set(g, null);
  }
  const named = detected.groups.filter((g) => byGroup.get(g.id));
  for (const g of detected.groups) {
    if (byGroup.has(g.id)) continue;
    // Small loose specks (a stray sparkle beside a galaxy) join the nearest named asset.
    const near = g.area <= (config.strayArea ?? 80) && named
      .map((n) => ({ n, d: Math.max(0, n.x0 - g.x1, g.x0 - n.x1) + Math.max(0, n.y0 - g.y1, g.y0 - n.y1) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= (config.strayDistance ?? 60)) byGroup.set(g.id, byGroup.get(near.n.id));
    else problems.push(`unnamed group #${g.id} at ${g.cx},${g.cy} (bbox ${g.x0},${g.y0}-${g.x1},${g.y1}, ${g.area}px)`);
  }
  if (problems.length) throw new Error(`${theme}:\n  ${problems.join('\n  ')}`);
  return byGroup;
}

async function preview(theme, config, outDir) {
  const sheet = await loadSheet(path.join(SHEET_DIR, config.sheet));
  const detected = detectGroups(sheet, config);
  let names = new Map();
  try {
    names = assign(theme, config, sheet, detected);
  } catch (error) {
    console.log(String(error.message));
  }
  const boxes = detected.groups.map((g) => {
    const name = names.get(g.id);
    const colour = name ? '#00e5ff' : name === null ? '#888888' : '#ffea00';
    const text = name || (name === null ? 'skip' : `#${g.id}`);
    return `<rect x="${g.x0}" y="${g.y0}" width="${g.x1 - g.x0 + 1}" height="${g.y1 - g.y0 + 1}" fill="none" stroke="${colour}" stroke-width="2"/>`
      + `<text x="${g.x0 + 2}" y="${g.y0 + 12}" font-size="12" font-family="sans-serif" fill="${colour}" stroke="#000" stroke-width="3" paint-order="stroke">${text}</text>`;
  }).join('');
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}" height="${sheet.height}">${boxes}</svg>`);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${theme}-groups.png`);
  await sharp(path.join(SHEET_DIR, config.sheet)).flatten({ background: '#ff00ff' }).composite([{ input: overlay }]).png().toFile(file);
  console.log(`${theme}: ${detected.groups.length} groups -> ${file}`);
}

async function extract(theme, config) {
  const sheet = await loadSheet(path.join(SHEET_DIR, config.sheet));
  const { data, width, height } = sheet;
  const detected = detectGroups(sheet, config);
  const names = assign(theme, config, sheet, detected);
  const walls = new Uint8Array(width * height);
  for (const line of config.cuts || []) cut(walls, width, height, line, 1);
  const owner = claimTerritory(sheet, detected.groupOf, config.territory ?? TERRITORY, walls);
  const detectAlpha = config.detectAlpha ?? DETECT_ALPHA;
  const groupName = (g) => (g ? names.get(g) : undefined);
  // Visible pixels nobody claimed (beyond every object's reach, or in a skipped group) are not
  // exported; report them so a too-short reach never drops glow silently.
  let unclaimed = 0;
  let unclaimedMax = 0;
  for (let i = 0; i < owner.length; i += 1) {
    const a = data[i * 4 + 3];
    if (a >= CROP_ALPHA && !groupName(owner[i])) {
      unclaimed += 1;
      if (a > unclaimedMax) unclaimedMax = a;
    }
  }
  console.log(`${theme}: ${unclaimed} visible pixels (alpha >= ${CROP_ALPHA}) belong to no asset; brightest alpha ${unclaimedMax}`);

  const dir = path.join(OUT_DIR, config.dir);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(dir)) if (file.endsWith('.png')) fs.unlinkSync(path.join(dir, file));

  const results = [];
  for (const asset of config.assets) {
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    let faintLost = 0;
    let touchesSheetEdge = false;
    for (let i = 0; i < owner.length; i += 1) {
      if (groupName(owner[i]) !== asset.name || data[i * 4 + 3] < CROP_ALPHA) continue;
      const x = i % width;
      const y = (i - x) / width;
      // Only painted art on the border means the source itself may be cut off; haze there is normal.
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && data[i * 4 + 3] >= detectAlpha) touchesSheetEdge = true;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    const left = Math.max(0, x0 - PADDING);
    const top = Math.max(0, y0 - PADDING);
    const right = Math.min(width - 1, x1 + PADDING);
    const bottom = Math.min(height - 1, y1 + PADDING);
    const w = right - left + 1;
    const h = bottom - top + 1;
    const out = Buffer.alloc(w * h * 4);
    let removedNeighbour = 0;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const i = y * width + x;
        const o = ((y - top) * w + (x - left)) * 4;
        if (groupName(owner[i]) === asset.name) {
          data.copy(out, o, i * 4, i * 4 + 4);
        } else if (data[i * 4 + 3] >= detectAlpha) {
          removedNeighbour += 1;
        }
      }
    }
    for (let i = 0; i < owner.length; i += 1) {
      if (groupName(owner[i]) !== asset.name) continue;
      const x = i % width;
      const y = (i - x) / width;
      if ((x < left || x > right || y < top || y > bottom) && data[i * 4 + 3] > 0) faintLost = Math.max(faintLost, data[i * 4 + 3]);
    }
    const file = path.join(dir, `${asset.name}.png`);
    await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(file);
    const bytes = fs.statSync(file).size;
    results.push({ ...asset, file, width: w, height: h, bytes, removedNeighbour, faintLost, touchesSheetEdge });
  }
  return results;
}

function manifestSection(theme, config, results) {
  const lines = [`## ${config.title}`, '', `Source: \`design/asset-sheets/${config.sheet}\`. ${results.length} assets, ${(results.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(0)} KB.`, ''];
  for (const r of results) {
    lines.push(`### ${config.dir}/${r.name}.png`, '');
    lines.push(`- Theme: ${config.title}`);
    lines.push(`- Mode: ${r.mode}`);
    lines.push(`- Size: ${r.width}×${r.height} px, ${(r.bytes / 1024).toFixed(0)} KB`);
    lines.push(`- Role: ${r.role}`);
    lines.push(`- Motion: ${r.motion}`);
    lines.push(`- Mobile: ${r.mobile}`);
    lines.push('');
  }
  return lines.join('\n');
}

const [target, flag, previewDir] = process.argv.slice(2);
const themes = target === 'all' ? Object.keys(THEME_ASSETS) : [target];
if (!target || themes.some((t) => !THEME_ASSETS[t])) {
  throw new Error(`Usage: node scripts/extract-theme-assets.mjs <${Object.keys(THEME_ASSETS).join('|')}|all> [--preview <dir>]`);
}

if (flag === '--preview') {
  for (const theme of themes) await preview(theme, THEME_ASSETS[theme], previewDir || 'theme-asset-preview');
} else {
  const sections = {};
  for (const theme of themes) {
    const results = await extract(theme, THEME_ASSETS[theme]);
    sections[theme] = results;
    for (const r of results) {
      const notes = [
        r.removedNeighbour ? `removed ${r.removedNeighbour}px of neighbouring art` : '',
        r.faintLost > 3 ? `LOST pixels up to alpha ${r.faintLost}` : '',
        r.touchesSheetEdge ? 'touches the sheet edge (may be cut off in the source)' : ''
      ].filter(Boolean).join('; ');
      console.log(`${theme}/${r.name}.png ${r.width}x${r.height} ${(r.bytes / 1024).toFixed(0)}KB${notes ? `  ! ${notes}` : ''}`);
    }
  }
  // The manifest covers every configured theme; themes not extracted this run keep their
  // section from the files already on disk.
  const manifest = ['# Theme asset manifest', '', 'Generated by `node scripts/extract-theme-assets.mjs all` from the sheets in', '`design/asset-sheets/`; edit `scripts/theme-assets.config.mjs`, not this file. The PNGs are', 'lossless masters cut from the sheets at their original resolution (never upscaled).', ''];
  for (const [theme, config] of Object.entries(THEME_ASSETS)) {
    const results = sections[theme] || config.assets
      .map((a) => {
        const file = path.join(OUT_DIR, config.dir, `${a.name}.png`);
        return fs.existsSync(file) ? { ...a, file, bytes: fs.statSync(file).size, ...sizeOf(file) } : null;
      })
      .filter(Boolean);
    if (results.length) manifest.push(manifestSection(theme, config, results));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'ASSET-MANIFEST.md'), manifest.join('\n'));
}

function sizeOf(file) {
  const png = fs.readFileSync(file);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
