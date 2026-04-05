import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ProtectedRoute, PublicOnlyRoute, AdminGuard } from '@/components';
import { LoginPage } from '@/pages/LoginPage';
import { ContestsPage } from '@/pages/ContestsPage';
import { HomePage } from '@/pages/HomePage';
import { SubmitWorkPage } from '@/pages/SubmitWorkPage';
import { ResultPage } from '@/pages/ResultPage';
import { BatchResultPage } from '@/pages/BatchResultPage';
import { ZipBatchResultPage } from '@/pages/ZipBatchResultPage';
import { CheckCertificatePage } from '@/pages/CheckCertificatePage';
import { HistoryPage } from '@/pages/HistoryPage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { ContestManagement } from '@/pages/admin/ContestManagement';
import { AnnouncementManagement } from '@/pages/admin/AnnouncementManagement';
import { RuleManagement } from '@/pages/admin/RuleManagement';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        {/* 主首页：展示系统介绍和核心功能 */}
        <Route path="/" element={<HomePage />} />

        {/* 竞赛列表页：展示竞赛列表和公告 */}
        <Route path="/contests" element={<ContestsPage />} />

        {/* 公开结果页：查看评审结果（本地存储） */}
        <Route path="/result/:workflowRunId" element={<ResultPage />} />

        {/* 批量结果页：查看批量评审结果 */}
        <Route path="/batch-result/:workflowRunIds" element={<BatchResultPage />} />

        {/* ZIP 批量结果页：查看 ZIP 批量评审结果 */}
        <Route path="/zip-batch-result/:manifestId" element={<ZipBatchResultPage />} />

        {/* 证书核验页：公开访问 */}
        <Route path="/check-certificate" element={<CheckCertificatePage />} />

        {/* 登录页：已登录用户不能访问 */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        {/* 受保护路由：必须登录 */}
        <Route element={<ProtectedRoute />}>
          <Route path="/judge" element={<SubmitWorkPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Route>

        {/* 管理员路由：必须 admin/owner */}
        <Route element={<AdminGuard />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/contests" replace />} />
            <Route path="contests" element={<ContestManagement />} />
            <Route path="announcements" element={<AnnouncementManagement />} />
            <Route path="rules" element={<RuleManagement />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </QueryClientProvider>
  );
}

export default App;
