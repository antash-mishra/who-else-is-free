import { Platform } from 'react-native';
import Constants from 'expo-constants';

const resolveApiBaseUrl = () => {
  const envUrl =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_BASE_URL) || undefined;
  if (envUrl && envUrl.length > 0) {
    return envUrl.replace(/\/$/, '');
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.manifest2 as any)?.extra?.expoClientHost ||
    (Constants.manifest as any)?.debuggerHost;

  if (hostUri) {
    try {
      const normalized = hostUri.includes('://') ? hostUri : `http://${hostUri}`;
      const url = new URL(normalized);
      const host = url.hostname;
      if (host) {
        const resolvedHost = host === 'localhost' && Platform.OS === 'android' ? '10.0.2.2' : host;
        return `http://${resolvedHost}:8080`;
      }
    } catch (error) {
      console.warn('Failed to derive host from Expo metadata', error);
    }
  }

  return 'http://192.168.1.8:8080';
};

export const API_BASE_URL = resolveApiBaseUrl();

const resolveWsBaseUrl = () => {
  const envUrl =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_WS_BASE_URL) || undefined;
  if (envUrl && envUrl.length > 0) {
    return envUrl.replace(/\/$/, '');
  }

  try {
    const apiUrl = new URL(API_BASE_URL);
    const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${apiUrl.host}`;
  } catch (error) {
    console.warn('Failed to derive WS base URL, falling back to API base URL', error);
    return API_BASE_URL.replace(/^http/, 'ws');
  }
};

export const WS_BASE_URL = resolveWsBaseUrl();

export const CHAT_ENABLED =
  typeof process !== 'undefined'
    ? process.env?.EXPO_PUBLIC_CHAT_ENABLED !== 'false'
    : true;
