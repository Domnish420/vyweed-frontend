import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

// In Expo Go dev builds, hostUri is the Metro server's "IP:port".
// Extract the IP and assume the backend is on the same machine at port 8000.
// EAS-built APKs always have apiBaseUrl set via environment secret, so this
// fallback only fires during local `npx expo start` sessions.
function resolveApiBaseUrl() {
  if (extra.apiBaseUrl) return extra.apiBaseUrl;
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8000`;
  }
  return 'http://localhost:8000';
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_V1       = `${API_BASE_URL}/api/v1`;

// Bypasses ngrok's browser interstitial page on free-tier tunnels.
// Harmless when using a direct IP or real domain.
export const BACKEND_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

export const ENDPOINTS = {
  strains:       `${API_BASE_URL}/strains`,
  search:        `${API_BASE_URL}/search`,
  grows:         `${API_BASE_URL}/grows`,
  dailyReport:   `${API_BASE_URL}/daily-report`,
  vpd:           `${API_BASE_URL}/vpd`,
  diagnose:      `${API_BASE_URL}/diagnose`,
  nutrients:     `${API_BASE_URL}/nutrients`,
  photos:        `${API_BASE_URL}/photos`,
  growverChat:   `${API_BASE_URL}/api/v1/growver/chat`,
  growverStatus: `${API_BASE_URL}/api/v1/growver/status`,
};

export default API_BASE_URL;
