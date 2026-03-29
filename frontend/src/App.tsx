import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ProtectedRoute, PublicOnlyRoute } from '@/components/ProtectedRoute';
import { AdminGuard } from '@/components/AdminGuard';
import { LoginPage } from '@/pages/LoginPage';
import { LandingPage } from '@/pages/LandingPage';  // 竞赛列表页
import { HomePage } from '@/pages/HomePage';  // 主首页
import { StartPage } from '@/pages/StartPage';
import { ResultPage } from '@/pages/ResultPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { CheckCertificatePage } from '@/pages/CheckCertificatePage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { ContestManagement } from '@/pages/admin/ContestManagement';
import { AnnouncementManagement } from '@/pages/admin/AnnouncementManagement';
import { RuleManagement } from '@/pages/admin/RuleManagement';

const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/contests",
    element: <LandingPage />,
  },
  {
    path: "/result/:workflowRunId",
    element: <ResultPage />,
  },
  {
    path: "/check-certificate",
    element: <CheckCertificatePage />,
  },
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: "/login",
        element: <LoginPage />,
      }
    ]
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/judge",
        element: <StartPage />,
      },
      {
        path: "/history",
        element: <HistoryPage />,
      }
    ]
  },
  {
    element: <AdminGuard />,
    children: [
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="/admin/contests" replace /> },
          { path: "contests", element: <ContestManagement /> },
          { path: "announcements", element: <AnnouncementManagement /> },
          { path: "rules", element: <RuleManagement /> },
        ]
      }
    ]
  },
  {
    path: "*",
    element: <Navigate to="/" />,
  }
]);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;