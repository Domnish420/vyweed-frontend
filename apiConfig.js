import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

const extra = Constants.expoConfig?.extra ?? {};

// In Expo Go dev builds, the JavaScript bundle is served from Metro at the PC's
// LAN IP. SourceCode.scriptURL looks like "http://192.168.x.x:8081/index.bundle".
// We extract that IP and assume the backend is on the same machine at port 8000.
// EAS-built APKs always have apiBaseUrl set via environment secret so this
// path is never reached in production.
function resolveApiBaseUrl() {
  if (extra.apiBaseUrl) return extra.apiBaseUrl;

  if (__DEV__) {
    try {
      const scriptURL = NativeModules.SourceCode?.scriptURL;
      if (scriptURL) {
        const match = scriptURL.match(/^https?:\/\/([\d.]+)/);
        if (match && match[1] !== '127.0.0.1') {
          return `http://${match[1]}:8000`;
        }
      }
    } catch {}

    const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest?.debuggerHost;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:8000`;
      }
    }
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
