import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';

// 扩展 AxiosRequestConfig 类型以包含自定义属性
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    skipAuth?: boolean;
  }
}

const createApiClient = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: '/api',
    timeout: 300000,
  });

  // Request interceptor: 自动添加 Token
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
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
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiErrorResponse>) => {
      if (error.response?.status === 401) {
        useAuthStore.getState().clearAuth();

        // 避免在登录页本身触发跳转
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }

      // 统一错误处理
      const message = error.response?.data?.detail || error.message;
      return Promise.reject({ ...error, message });
    }
  );

  return instance;
};

interface ApiErrorResponse {
  detail?: string;
}

export const rawClient = createApiClient();

// 默认导出的 client 自动提取 response.data
const client = createApiClient();
client.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error)
);

export default client;
