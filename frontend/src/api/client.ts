import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// 扩展 AxiosRequestConfig 类型以包含自定义属性
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    skipAuth?: boolean;
  }
}

const client: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 300000,
});

// Request interceptor: 自动添加 Token
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 如果标记了 skipAuth，则不添加 token
    if (!config.skipAuth) {
      const token = localStorage.getItem('auth_token');
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
      // Token 过期或无效，清除本地存储并跳转登录页
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
      
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