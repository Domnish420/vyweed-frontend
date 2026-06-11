/**
 * cache.js
 * Offline cache utility for VYWEED
 * Wraps AsyncStorage with timestamps and fallback logic
 *
 * Usage:
 *   import { cachedFetch, clearCache, getCacheAge } from './cache'
 *
 *   // Instead of fetch(url) use:
 *   const data = await cachedFetch(url)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { BACKEND_HEADERS } from "./apiConfig";

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const TIMEOUT   = 4000;                  // 4 second network timeout

// ── Connection state ──────────────────────────────────────────────────────────
let _isOnline = true;
let _listeners = [];

export function getIsOnline() { return _isOnline; }

export function onConnectionChange(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function setOnline(val) {
  if (_isOnline !== val) {
    _isOnline = val;
    _listeners.forEach(fn => fn(val));
  }
}

// ── Core fetch with cache ─────────────────────────────────────────────────────
export async function cachedFetch(url, opts = {}) {
  const key = `cache:${url}`;

  // Try network first with timeout
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout || TIMEOUT);

    const res = await fetch(url, { signal: controller.signal, headers: BACKEND_HEADERS });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();

    // Save to cache
    await AsyncStorage.setItem(key, JSON.stringify({
      data,
      ts: Date.now(),
      url,
    })).catch(() => {});

    setOnline(true);
    return { data, fromCache: false, online: true };

  } catch (err) {
    // Network failed — try cache
    setOnline(false);
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const cached = JSON.parse(raw);
        return { data: cached.data, fromCache: true, online: false, cachedAt: cached.ts };
      }
    } catch {}
    // Nothing in cache either
    throw new Error("No connection and no cached data available");
  }
}

// ── Save arbitrary data to cache ──────────────────────────────────────────────
export async function saveToCache(key, data) {
  try {
    await AsyncStorage.setItem(`cache:${key}`, JSON.stringify({
      data, ts: Date.now(),
    }));
  } catch {}
}

export async function loadFromCache(key) {
  try {
    const raw = await AsyncStorage.getItem(`cache:${key}`);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return { data: cached.data, cachedAt: cached.ts };
  } catch { return null; }
}

// ── Cache age helper ──────────────────────────────────────────────────────────
export function formatCacheAge(ts) {
  if (!ts) return "unknown";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Clear all cache ───────────────────────────────────────────────────────────
export async function clearCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith("cache:"));
    await AsyncStorage.multiRemove(cacheKeys);
    return cacheKeys.length;
  } catch { return 0; }
}

// ── Check backend reachable ───────────────────────────────────────────────────
export async function checkConnection(apiBase) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${apiBase.replace("/api/v1", "")}/health`,
      { signal: controller.signal, headers: BACKEND_HEADERS });
    setOnline(res.ok);
    return res.ok;
  } catch {
    setOnline(false);
    return false;
  }
}
