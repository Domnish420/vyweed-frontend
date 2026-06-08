/**
 * waitTimer.js
 * Wait timer system for VYWEED virtual grow game
 *
 * Formula: wait_seconds = min(14400, 300 + (trophyCount * 15))
 * +15 seconds per trophy earned
 * Starts at 5 minutes (300 seconds)
 * Caps at 4 hours (14400 seconds) at trophy 920
 *
 * Rolling ad = halves current wait (applied to remaining time)
 * Ad skip    = skip entire remaining wait
 * Tokens     = same as ad skip, no ad shown
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY   = "vyweed_wait_timer";
const BASE_WAIT     = 300;    // 5 minutes in seconds
const INCREMENT     = 15;     // +15 seconds per trophy
const MAX_WAIT      = 14400;  // 4 hours in seconds
const CAP_AT_TROPHY = 920;    // wait caps here

// ── Core formula ──────────────────────────────────────────────────────────────
export function getWaitSeconds(trophyCount) {
  return Math.min(MAX_WAIT, BASE_WAIT + (trophyCount * INCREMENT));
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
// Saved to AsyncStorage:
// {
//   startedAt: timestamp ms,
//   waitSeconds: total wait in seconds for this plant,
//   remainingSeconds: what's left (after any ad reductions),
//   active: bool — is a timer currently running
// }

export async function getTimerState() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    // Calculate how much time has elapsed
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

export async function applyRollingAd() {
  // Rolling ad = halve remaining wait
  const state = await getTimerState();
  if (!state || state.isComplete) return null;
  const newRemaining = Math.floor(state.remaining / 2);
  const updated = {
    ...state,
    startedAt: Date.now(),
    remainingSeconds: newRemaining,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return { saved: state.remaining - newRemaining, newRemaining };
}

export async function skipTimer() {
  // Ad skip or token = complete the wait instantly
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

// ── Progress curve data (for showing users) ───────────────────────────────────
export function getProgressMilestones() {
  return [
    { trophy: 1,    wait: getWaitSeconds(0) },
    { trophy: 10,   wait: getWaitSeconds(10) },
    { trophy: 50,   wait: getWaitSeconds(50) },
    { trophy: 100,  wait: getWaitSeconds(100) },
    { trophy: 250,  wait: getWaitSeconds(250) },
    { trophy: 500,  wait: getWaitSeconds(500) },
    { trophy: 920,  wait: getWaitSeconds(920) },
    { trophy: 1000, wait: getWaitSeconds(1000) },
    { trophy: 5042, wait: getWaitSeconds(5042) },
  ];
}
