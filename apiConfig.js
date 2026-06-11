import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

const extra = Constants.expoConfig?.extra ?? {};

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

// Mutable — App.js overwrites this on startup from AsyncStorage (Settings).
let _baseUrl = resolveApiBaseUrl();

export const getApiBaseUrl = () => _baseUrl;
export const getApiV1     = () => `${_baseUrl}/api/v1`;

// Called once from App.js after reading vyweed_settings from AsyncStorage.
// Strips any trailing /api/v1 so the value is always a bare base URL.
export function setApiBaseUrl(url) {
  if (!url) return;
  _baseUrl = url.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}

// Bypasses ngrok's browser interstitial page on free-tier tunnels.
export const BACKEND_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

// Legacy constants kept for any code not yet migrated to the getters.
export const API_BASE_URL = _baseUrl;
export const API_V1       = `${_baseUrl}/api/v1`;

export default API_BASE_URL;
