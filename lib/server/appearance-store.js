import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { writeFileAtomic } from './atomic-file.js';

// Kept by the app on disk rather than only in browser storage: managed browsers are often set
// to clear site data on close, which made people re-pick their theme and colours every launch.
const dataDir = path.resolve(process.cwd(), process.env.APP_DATA_DIR || 'data');
const storePath = path.resolve(dataDir, 'appearance.json');
const PROFILE_LIMIT = 30;

export const APPEARANCE_THEMES = ['glass', 'oled', 'neon', 'minimal', 'neumorphic', 'pastel', 'cyberpunk', 'cottagecore', 'garden', 'space'];
export const APPEARANCE_MODES = ['dark', 'light', 'system'];
// Profiles saved with the colour-only themes before 1.8 open with the closest new look.
export const LEGACY_APPEARANCE_THEMES = { midnight: 'glass', harbor: 'glass', ink: 'neon', forge: 'cyberpunk', field: 'cottagecore', paper: 'minimal' };
export const APPEARANCE_THEME_COLOR_TOKENS = ['background', 'panel', 'text', 'muted', 'line', 'accent', 'accent2', 'success', 'warning', 'danger'];
export const APPEARANCE_TINT_SECTIONS = ['connection', 'header', 'explorer', 'builder', 'editor', 'results', 'activity', 'dialogs'];
export const APPEARANCE_EXPLORER_SIZES = ['compact', 'default', 'large', 'xlarge'];

let writeQueue = Promise.resolve();

function badRequest(message) {
  const error = new Error(message);
  error.httpStatus = 400;
  return error;
}

function normalizeButtonColors(input, { strict = false } = {}) {
  const colors = {};
  Object.entries(input && typeof input === 'object' ? input : {}).forEach(([section, value]) => {
    if (!APPEARANCE_TINT_SECTIONS.includes(section)) {
      if (strict) throw badRequest(`Unknown button colour section: ${section}.`);
      return;
    }
    const hex = String(value || '').trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) {
      if (strict) throw badRequest(`Button colour for ${section} must be a #rrggbb colour.`);
      return;
    }
    colors[section] = hex;
  });
  return colors;
}

// Theme colours are kept per mode: { dark: { accent: '#rrggbb', ... }, light: { ... } }.
function normalizeThemeColors(input, { strict = false } = {}) {
  const byTone = {};
  Object.entries(input && typeof input === 'object' ? input : {}).forEach(([tone, colors]) => {
    if (!['dark', 'light'].includes(tone)) {
      if (strict) throw badRequest(`Theme colours are kept per mode (dark or light), not "${tone}".`);
      return;
    }
    const normalized = normalizeToneColors(colors, { strict });
    if (Object.keys(normalized).length) byTone[tone] = normalized;
  });
  return byTone;
}

function normalizeToneColors(input, { strict = false } = {}) {
  const colors = {};
  Object.entries(input && typeof input === 'object' ? input : {}).forEach(([token, value]) => {
    if (!APPEARANCE_THEME_COLOR_TOKENS.includes(token)) {
      if (strict) throw badRequest(`Unknown theme colour: ${token}.`);
      return;
    }
    const hex = String(value || '').trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) {
      if (strict) throw badRequest(`Theme colour ${token} must be a #rrggbb colour.`);
      return;
    }
    colors[token] = hex;
  });
  return colors;
}

function normalizeProfile(input = {}, { strict = false } = {}) {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const requestedTheme = String(input.theme || '').trim().toLowerCase();
  const theme = LEGACY_APPEARANCE_THEMES[requestedTheme] || requestedTheme;
  if (!name) {
    if (strict) throw badRequest('An appearance profile needs a name.');
    return null;
  }
  if (!APPEARANCE_THEMES.includes(theme)) {
    if (strict) throw badRequest(`Theme must be one of: ${APPEARANCE_THEMES.join(', ')}.`);
    return null;
  }
  const profile = {
    id: String(input.id || '').trim().slice(0, 80),
    name,
    theme,
    buttonColors: normalizeButtonColors(input.buttonColors, { strict }),
    themeColors: normalizeThemeColors(input.themeColors, { strict })
  };
  const mode = String(input.mode ?? '').trim().toLowerCase();
  if (APPEARANCE_MODES.includes(mode)) {
    profile.mode = mode;
  } else if (mode && strict) {
    throw badRequest(`Mode must be one of: ${APPEARANCE_MODES.join(', ')}.`);
  } else if (requestedTheme === 'paper') {
    // The one light theme from before modes existed keeps opening light.
    profile.mode = 'light';
  }
  if (input.sceneryLevel !== undefined && input.sceneryLevel !== null && input.sceneryLevel !== '') {
    const level = Number(input.sceneryLevel);
    if (Number.isFinite(level) && level >= 0 && level <= 100) {
      profile.sceneryLevel = Math.round(level);
    } else if (strict) {
      throw badRequest('Background scenery must be a number from 0 to 100.');
    }
  }
  // Optional: profiles saved before the size existed have none, and applying them leaves the
  // current size alone rather than resetting it.
  const explorerSize = String(input.explorerSize ?? '').trim().toLowerCase();
  if (APPEARANCE_EXPLORER_SIZES.includes(explorerSize)) {
    profile.explorerSize = explorerSize;
  } else if (explorerSize && strict) {
    throw badRequest(`Object list size must be one of: ${APPEARANCE_EXPLORER_SIZES.join(', ')}.`);
  }
  return profile;
}

async function readStore() {
  let parsed = {};
  try {
    parsed = JSON.parse(await fs.readFile(storePath, 'utf8'));
  } catch {
    parsed = {};
  }
  const profiles = (Array.isArray(parsed.profiles) ? parsed.profiles : [])
    .map((profile) => {
      const normalized = normalizeProfile(profile);
      return normalized ? { ...normalized, id: normalized.id || crypto.randomUUID(), updatedAt: String(profile.updatedAt || '') } : null;
    })
    .filter(Boolean);
  const defaultProfileId = profiles.some((profile) => profile.id === parsed.defaultProfileId) ? parsed.defaultProfileId : '';
  return { profiles, defaultProfileId };
}

async function withSerializedWrite(work) {
  const run = writeQueue.then(async () => {
    const store = await readStore();
    const result = await work(store);
    await fs.mkdir(dataDir, { recursive: true });
    await writeFileAtomic(storePath, JSON.stringify(store, null, 2));
    return result;
  });
  // The caller sees the failure; the queue must not, or one rejected write blocks every later one.
  writeQueue = run.catch(() => {});
  return run;
}

export async function getAppearance() {
  await writeQueue;
  return readStore();
}

/**
 * Save a profile. Without an id, a profile with the same name is updated rather than duplicated.
 * `makeDefault` also makes it the profile the app opens with.
 */
export async function saveAppearanceProfile(input = {}, { makeDefault = false } = {}) {
  const normalized = normalizeProfile(input, { strict: true });
  return withSerializedWrite(async (store) => {
    const index = normalized.id
      ? store.profiles.findIndex((profile) => profile.id === normalized.id)
      : store.profiles.findIndex((profile) => profile.name.toLowerCase() === normalized.name.toLowerCase());
    if (index < 0 && store.profiles.length >= PROFILE_LIMIT) {
      throw badRequest(`You can keep up to ${PROFILE_LIMIT} appearance profiles. Delete one first.`);
    }
    const saved = {
      ...normalized,
      id: index >= 0 ? store.profiles[index].id : (normalized.id || crypto.randomUUID()),
      updatedAt: new Date().toISOString()
    };
    if (index >= 0) store.profiles[index] = saved;
    else store.profiles.push(saved);
    if (makeDefault) store.defaultProfileId = saved.id;
    return { profile: saved, defaultProfileId: store.defaultProfileId };
  });
}

export async function setDefaultAppearanceProfile(id) {
  const cleanId = String(id || '').trim();
  return withSerializedWrite(async (store) => {
    if (cleanId && !store.profiles.some((profile) => profile.id === cleanId)) {
      const error = new Error('Appearance profile not found.');
      error.httpStatus = 404;
      throw error;
    }
    store.defaultProfileId = cleanId;
    return { defaultProfileId: cleanId };
  });
}

export async function deleteAppearanceProfile(id) {
  const cleanId = String(id || '').trim();
  return withSerializedWrite(async (store) => {
    const index = store.profiles.findIndex((profile) => profile.id === cleanId);
    if (index < 0) return false;
    store.profiles.splice(index, 1);
    if (store.defaultProfileId === cleanId) store.defaultProfileId = '';
    return true;
  });
}
