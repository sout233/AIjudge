import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft, Trophy, Bell, Scale, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { authApi } from '@/api/auth';

export function AdminLayout() {
  const location = useLocation();
  const currentTab = location.pathname.split('/').pop() || 'contests';

  return (
    <div className="min-h-screen pb-10">
      {/* Navbar */}
      <div className="border-b bg-card mb-6">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-xl font-bold">管理后台</h1>
          <div className="flex items-center gap-4">
            <NavLink to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                首页
              </Button>
            </NavLink>
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-2 text-muted-foreground hover:text-destructive"
              onClick={() => authApi.logout()}
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4">
        <Tabs value={currentTab} className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="contests" asChild>
              <NavLink to="/admin/contests" className={({ isActive }: { isActive: boolean }) => cn("gap-2", isActive ? "data-[state=active]" : "")}>
                <Trophy className="h-4 w-4" />
                竞赛管理
              </NavLink>
            </TabsTrigger>
            <TabsTrigger value="announcements" asChild>
              <NavLink to="/admin/announcements" className="gap-2">
                <Bell className="h-4 w-4" />
                公告管理
              </NavLink>
            </TabsTrigger>
            <TabsTrigger value="rules" asChild>
              <NavLink to="/admin/rules" className="gap-2">
                <Scale className="h-4 w-4" />
                规则管理
              </NavLink>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Main Content */}
        <div className="bg-card border rounded-lg shadow-sm min-h-[500px] p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}