import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Calendar,
  ChevronRight,
  LogIn,
  FileText,
  Bell,
  MapPin,
  Shield,
} from 'lucide-react';
import { adminApi } from '@/api/admin';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RichContent, MarkdownPreview } from '@/components/ui/rich-editor';
import { isMarkdownContent } from '@/lib/markdown';
import type { Contest } from '@/types';

function formatContestDateRange(contest: Contest) {
  const formatDate = (value?: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const start = formatDate(contest.start_time);
  const end = formatDate(contest.end_time);

  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} 起`;
  if (end) return `截止 ${end}`;
  if (contest.endDate) return contest.endDate;
  return '待定';
}

export function ContestsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);

  // 获取竞赛列表
  const { data: contests = [], isLoading } = useQuery({
    queryKey: ['contests-public'],
    queryFn: adminApi.getContests,
  });

  // 获取选中竞赛的公告
  const { data: announcement } = useQuery({
    queryKey: ['announcement-public', selectedContest?.id],
    queryFn: () => adminApi.getAnnouncement(selectedContest!.id),
    enabled: !!selectedContest,
  });

  // 只显示已上线的竞赛
  const publishedContests = contests.filter((c) => c.is_published);
  const activeContests = publishedContests.filter((c) => c.status === 'active');
  const upcomingContests = publishedContests.filter((c) => c.status === 'upcoming');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-600 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">灵审云评</h1>
              <p className="text-xs text-slate-500">AI智能文档评审工作站</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600 hidden sm:block">
                  {user?.email}
                </span>
                <Button
                  size="sm"
                  onClick={() => navigate('/judge')}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  开始评审
                </Button>
                {(user?.role === 'admin' || user?.role === 'owner') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/admin')}
                  >
                    管理后台
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/login')}
              >
                <LogIn className="w-4 h-4 mr-2" />
                登录
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-cyan-900 via-slate-900 to-purple-900 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              AI 驱动的智能竞赛评审平台
            </h2>
            <p className="text-lg text-slate-300 mb-8 leading-relaxed">
              基于大语言模型技术，为学术竞赛、创新创业大赛提供
              公正、高效、智能化的文档评审服务。
            </p>
            <div className="flex gap-4">
              <Button
                size="lg"
                onClick={() => navigate('/judge')}
                className="h-12 bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-semibold"
              >
                立即参与
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => document.getElementById('contests')?.scrollIntoView({ behavior: 'smooth' })}
                className="h-12 border-slate-400 text-slate-800 hover:bg-slate-400"
              >
                查看竞赛
              </Button>
              {/* 新增次要按钮：证书鉴伪入口 */}
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate('/check-certificate')}
                className="h-12 px-8 text-lg border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/80 hover:border-emerald-500 transition-all"
              >
                <Shield className="w-5 h-5 mr-2" />
                证书鉴伪核验
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12" id="contests">
        <Tabs defaultValue="active" className="w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-2xl font-bold text-slate-900">支持竞赛</h3>
              <p className="text-slate-500 mt-1">选择竞赛查看详情并参与评审</p>
            </div>
            <TabsList>
              <TabsTrigger value="active">进行中</TabsTrigger>
              <TabsTrigger value="upcoming">即将开始</TabsTrigger>
              <TabsTrigger value="all">全部</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="active" className="mt-0">
            <ContestGrid
              contests={activeContests}
              isLoading={isLoading}
              onSelect={setSelectedContest}
              selectedId={selectedContest?.id}
            />
          </TabsContent>

          <TabsContent value="upcoming" className="mt-0">
            <ContestGrid
              contests={upcomingContests}
              isLoading={isLoading}
              onSelect={setSelectedContest}
              selectedId={selectedContest?.id}
            />
          </TabsContent>

          <TabsContent value="all" className="mt-0">
            <ContestGrid
              contests={publishedContests}
              isLoading={isLoading}
              onSelect={setSelectedContest}
              selectedId={selectedContest?.id}
            />
          </TabsContent>
        </Tabs>

        {/* Selected Contest Detail & Announcement */}
        {selectedContest && (
          <div className="mt-12 grid lg:grid-cols-3 gap-8">
            {/* Contest Info */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{selectedContest.name}</CardTitle>
                    <p className="text-slate-500 mt-2">{selectedContest.description}</p>
                  </div>
                  <Badge className={
                    selectedContest.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }>
                    {selectedContest.status === 'active' ? '进行中' : '即将开始'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Calendar className="w-5 h-5 text-cyan-600" />
                    <div>
                      <p className="text-xs text-slate-500">竞赛时间</p>
                      <p className="font-medium">{formatContestDateRange(selectedContest)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <FileText className="w-5 h-5 text-orange-600" />
                    <div>
                      <p className="text-xs text-slate-500">提交作品</p>
                      <p className="font-medium">{selectedContest.submissions || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                    onClick={() => navigate('/judge', { state: { contestId: selectedContest.id } })}
                  >
                    提交作品参与竞赛
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Bell className="w-4 h-4 mr-2" />
                        查看公告
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Bell className="w-5 h-5 text-cyan-600" />
                          {selectedContest.name} - 竞赛公告
                        </DialogTitle>
                        <DialogDescription>
                          查看竞赛的详细公告内容
                        </DialogDescription>
                      </DialogHeader>
                      <div className="mt-4">
                        {announcement?.content ? (
                          isMarkdownContent(announcement.content) ? (
                            <MarkdownPreview content={announcement.content} className="prose max-w-none" />
                          ) : (
                            <RichContent content={announcement.content} className="prose max-w-none" />
                          )
                        ) : (
                          <p className="text-muted-foreground text-center py-8">暂无公告</p>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            {/* Quick Announcement Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="w-5 h-5 text-cyan-600" />
                  最新公告
                </CardTitle>
              </CardHeader>
              <CardContent>
                {announcement?.content ? (
                  <div className="space-y-3">
                    <div className="max-h-48 overflow-hidden relative">
                      {isMarkdownContent(announcement.content) ? (
                        <MarkdownPreview content={announcement.content} />
                      ) : (
                        <RichContent content={announcement.content} />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent" />
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="link" className="p-0 h-auto text-cyan-600">
                          查看完整公告 →
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Bell className="w-5 h-5 text-cyan-600" />
                            {selectedContest.name} - 竞赛公告
                          </DialogTitle>
                          <DialogDescription>
                            查看竞赛的详细公告内容
                          </DialogDescription>
                        </DialogHeader>
                        <div className="mt-4">
                          {isMarkdownContent(announcement.content) ? (
                            <MarkdownPreview content={announcement.content} className="prose max-w-none" />
                          ) : (
                            <RichContent content={announcement.content} className="prose max-w-none" />
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm">暂无公告</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 mt-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-6 h-6 text-cyan-400" />
                <span className="text-lg font-bold text-white">灵审云评</span>
              </div>
              <p className="text-sm leading-relaxed">
                基于 Dify 大语言模型的智能评审系统，<br />
                为竞赛提供公正、高效的评审服务。
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">联系我们</h4>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  联系地址
                </p>
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">快速链接</h4>
              <div className="space-y-2 text-sm">
                <button onClick={() => navigate('/')} className="block hover:text-cyan-400">首页</button>
                <button onClick={() => navigate('/judge')} className="block hover:text-cyan-400">提交评审</button>
                <button onClick={() => navigate('/login')} className="block hover:text-cyan-400">登录系统</button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 text-center">
            <p className="text-[9px] text-slate-500 mt-2">
              鄂ICP备2026012182号-1
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// 子组件：竞赛网格
interface ContestGridProps {
  contests: Contest[];
  isLoading: boolean;
  onSelect: (c: Contest) => void;
  selectedId?: string;
}

function ContestGrid({ contests, isLoading, onSelect, selectedId }: ContestGridProps) {
  if (isLoading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="h-48 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  if (contests.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>暂无竞赛</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {contests.map((contest) => (
        <Card
          key={contest.id}
          className={`cursor-pointer transition-all hover:shadow-lg ${
            selectedId === contest.id ? 'ring-2 ring-cyan-500' : ''
          }`}
          onClick={() => onSelect(contest)}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <CardTitle className="text-lg line-clamp-2">{contest.name}</CardTitle>
              {contest.status === 'active' && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 line-clamp-2 mb-4">
              {contest.description || '暂无描述'}
            </p>
            <div className="space-y-2 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatContestDateRange(contest)}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {contest.submissions || 0} 作品
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
