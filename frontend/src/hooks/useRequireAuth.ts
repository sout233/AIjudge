import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface UseRequireAuthOptions {
  redirectTo?: string;
  showToast?: boolean;
}

export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { redirectTo = '/login', showToast = true } = options;
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const requireAuth = useCallback((callback?: () => void) => {
    if (!isAuthenticated) {
      if (showToast) {
        // 可以在这里触发全局 toast 提示
        console.log('请先登录');
      }
      navigate(redirectTo, { 
        state: { from: window.location.pathname },
        replace: false 
      });
      return false;
    }
    
    callback?.();
    return true;
  }, [isAuthenticated, navigate, redirectTo, showToast]);

  return { requireAuth, isAuthenticated };
}