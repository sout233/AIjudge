import client from './client';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import type { AxiosRequestConfig } from 'axios';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const authApi = {
  login: (credentials: LoginCredentials): Promise<LoginResponse> => {
    // 跳过认证拦截，因为登录时还没有 token
    return client.post('/auth/login', credentials, { skipAuth: true } as AxiosRequestConfig);
  },

  logout: (): void => {
    useAuthStore.getState().clearAuth();
    window.location.href = '/login';
  },
};
