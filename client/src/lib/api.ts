// Owner: Sothcheat (auth). Placeholder until the JWT flow lands: it already sends a
// bearer token when one is stored, and falls back to the dev `x-user-id` header.
import axios from 'axios';

export const TOKEN_KEY = 'libraflow.token';
let devUserId: string | null = null;

export function setDevUser(id: string | null) {
  devUserId = id;
}

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' });

api.interceptors.request.use((config) => {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    // Storage can be blocked (private mode); the dev header still works
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else if (devUserId) config.headers['x-user-id'] = devUserId;
  return config;
});
