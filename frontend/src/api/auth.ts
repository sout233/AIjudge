import client from './client';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    email: string;
    dify_user_id: string;
  };
}

export const authApi = {
  login: (credentials: LoginCredentials): Promise<LoginResponse> => {
    // 跳过认证拦截，因为登录时还没有 token
    return client.post('/auth/login', credentials, { skipAuth: true } as any);
  },

  logout: (): void => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    window.location.href = '/login';
  },
};