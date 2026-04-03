import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';

const DEFAULT_API_TIMEOUT_MS = 15 * 60 * 1000;

// 扩展 AxiosRequestConfig 类型以包含自定义属性
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    skipAuth?: boolean;
  }
}

const client: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: DEFAULT_API_TIMEOUT_MS,
});

// Request interceptor: 自动添加 Token
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 如果标记了 skipAuth，则不添加 token
    if (!config.skipAuth) {
      const { token } = useAuthStore.getState();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: 统一处理 401
client.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();

      // 避免在登录页本身触发跳转
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // 统一错误处理
    const message = (error.response?.data as { detail?: string })?.detail || error.message;
    return Promise.reject({ ...error, message });
  }
);

export default client;
