/**
 * notifications.js
 * STUBBED for Expo Go testing
 * Full implementation active in production build
 * expo-notifications removed from Expo Go SDK 53+
 */

export const DEFAULT_NOTIF_SETTINGS = {
  plantReady:     true,
  dailyReminder:  true,
  dailyTime:      "09:00",
  harvestAlert:   true,
  streakReminder: true,
};

export async function requestNotificationPermissions() { return false; }
export async function loadNotifSettings() { return { ...DEFAULT_NOTIF_SETTINGS }; }
export async function saveNotifSettings() {}
export async function scheduleWaitTimerNotification() { return null; }
export async function scheduleDailyReminder() { return null; }
export async function scheduleHarvestAlert() { return null; }
export async function resetStreakReminder() {}
export async function cancelGrowNotifications() {}
export async function cancelNotification() {}
export async function cancelAllNotifications() {}
export async function getScheduledNotifications() { return []; }
export function addNotificationResponseListener() { return { remove: () => {} }; }
export function addNotificationReceivedListener() { return { remove: () => {} }; }
