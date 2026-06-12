/**
 * waitTimer.js
 * Wait timer system for VYWEED virtual grow game
 *
 * Formula:
 *   trophyCount <= 4  → 300s flat (5 min, hook new players)
 *   trophyCount > 4   → 300 + (count - 4) * 10s, capped at 14400s (4 hours)
 *
 * Ad skip = skip ENTIRE remaining wait (30-second unskippable ad)
 * Tokens  = same as ad skip, no ad shown
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "vyweed_wait_timer";
const BASE_WAIT   = 300;    // 5 minutes in seconds
const INCREMENT   = 10;     // +10 seconds per trophy after the hook period
const HOOK_COUNT  = 4;      // first N trophies all get BASE_WAIT flat
const MAX_WAIT    = 14400;  // 4 hours in seconds

// ── Core formula ──────────────────────────────────────────────────────────────
export function getWaitSeconds(trophyCount) {
  if (trophyCount <= HOOK_COUNT) return BASE_WAIT;
  return Math.min(MAX_WAIT, BASE_WAIT + (trophyCount - HOOK_COUNT) * INCREMENT);
}

export function getWaitFormatted(trophyCount) {
  return formatSeconds(getWaitSeconds(trophyCount));
}

export function formatSeconds(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (s > 0) return `${m}m ${s}s`;
  return `${m}m`;
}

// ── Timer state ───────────────────────────────────────────────────────────────
export async function getTimerState() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const remaining = Math.max(0, state.remainingSeconds - elapsed);
    return { ...state, remaining, isComplete: remaining === 0 };
  } catch { return null; }
}

export async function startTimer(trophyCount) {
  const waitSeconds = getWaitSeconds(trophyCount);
  const state = {
    startedAt: Date.now(),
    waitSeconds,
    remainingSeconds: waitSeconds,
    active: true,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

// Ad skip = entire remaining wait cleared (30-second unskippable ad)
export async function applyRollingAd() {
  return skipTimer();
}

export async function skipTimer() {
  const state = await getTimerState();
  if (!state) return false;
  const updated = {
    ...state,
    startedAt: Date.now() - (state.waitSeconds * 1000),
    remainingSeconds: 0,
    active: false,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return true;
}

export async function clearTimer() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function getProgressMilestones() {
  return [
    { trophy: 1,    wait: getWaitSeconds(1) },
    { trophy: 4,    wait: getWaitSeconds(4) },
    { trophy: 10,   wait: getWaitSeconds(10) },
    { trophy: 50,   wait: getWaitSeconds(50) },
    { trophy: 100,  wait: getWaitSeconds(100) },
    { trophy: 500,  wait: getWaitSeconds(500) },
    { trophy: 1414, wait: getWaitSeconds(1414) },
  ];
}
