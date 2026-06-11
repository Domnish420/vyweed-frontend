import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const API_BASE_URL = extra.apiBaseUrl ?? 'http://localhost:8000';
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
