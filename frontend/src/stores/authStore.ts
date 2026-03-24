import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  email: string;
  dify_user_id: string;
  role: 'admin' | 'owner' | 'user';
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) => set({ token, user, isAuthenticated: true }),
      clearAuth: () => set({ token: null, user: null, isAuthenticated: false }),
      isAdmin: () => {
        const role = get().user?.role;
        return role === 'admin' || role === 'owner';
      },
    }),
    {
      name: 'aijudge-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);