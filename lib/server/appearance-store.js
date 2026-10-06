import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { writeFileAtomic } from './atomic-file.js';

// Kept by the app on disk rather than only in browser storage: managed browsers are often set
// to clear site data on close, which made people re-pick their theme and colours every launch.
const dataDir = path.resolve(process.cwd(), process.env.APP_DATA_DIR || 'data');
const storePath = path.resolve(dataDir, 'appearance.json');
const PROFILE_LIMIT = 30;

export const APPEARANCE_THEMES = ['midnight', 'harbor', 'forge', 'field', 'ink', 'paper'];
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

function normalizeProfile(input = {}, { strict = false } = {}) {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const theme = String(input.theme || '').trim().toLowerCase();
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
    buttonColors: normalizeButtonColors(input.buttonColors, { strict })
  };
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
