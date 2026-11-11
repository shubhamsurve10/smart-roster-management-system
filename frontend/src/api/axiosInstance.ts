import axios from "axios";

export const API_BASE_URL =
  import.meta.env["VITE_API_BASE_URL"] || "http://localhost:5000/api";
  

const TOKEN_KEY = "roster_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      setToken(null);
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown): string {
  const e = error as { response?: { data?: { message?: string; error?: string } }; message?: string; code?: string };
  if (e?.response?.data?.message) return e.response.data.message;
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.code === "ERR_NETWORK") return `Cannot reach the server at ${API_BASE_URL}`;
  return e?.message || "Something went wrong";
}

/** Returns the id whether the backend sent a populated object or a raw ObjectId string. */
export function idOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const v = value as { _id?: string; id?: string };
  return v._id || v.id || "";
}

export default api;
