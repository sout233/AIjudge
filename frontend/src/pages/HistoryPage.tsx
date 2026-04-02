import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, 
  Calendar, 
  ChevronRight, 
  Search,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Timer,
  LogOut,
  ArrowLeft
} from 'lucide-react';
import { judgeApi } from '@/api/judge';
import { adminApi } from '@/api/admin';
import { authApi } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { JudgeHistory } from '@/types';

export function HistoryPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  // 获取历史记录
  const { data: history, isLoading, error } = useQuery({
    queryKey: ['judge-history'],
    queryFn: () => judgeApi.getHistory(),
  });

  // 获取所有竞赛，用于 ID 到名称的映射
  const { data: contests } = useQuery({
    queryKey: ['contests'],
    queryFn: () => adminApi.getContests(),
  });

  const contestMap = (contests || []).reduce((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {} as Record<string, string>);

  const filteredHistory = (history || []).filter(record => 
    record.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contestMap[record.contest_id] || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
      case 'succeeded':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">已完成</Badge>;
      case 'running':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50 animate-pulse">进行中</Badge>;
      case 'error':
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">失败</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/50">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
      case 'succeeded':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'running':
      case 'pending':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-12">
      {/* 顶部装饰栏 */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-700" />
      
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">测评历史</h1>
            <p className="text-slate-400">查看您过往的所有文档测评记录和评分结果</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" /> 返回首页
            </Button>
            <Button variant="ghost" size="sm" onClick={() => authApi.logout()} className="text-slate-400 hover:text-red-400 transition-colors">
              <LogOut className="w-4 h-4 mr-2" /> 退出
            </Button>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input 
                placeholder="搜索文件名或竞赛..." 
                className="pl-9 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" className="border-slate-700 bg-slate-900/50 text-slate-300">
              <Filter className="w-4 h-4 mr-2" />
              筛选
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
            <p className="text-slate-400">正在加载历史记录...</p>
          </div>
        ) : error ? (
          <Card className="bg-red-950/20 border-red-900/50 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">加载失败</h3>
            <p className="text-slate-400">无法获取历史记录，请稍后重试。</p>
          </Card>
        ) : filteredHistory.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800 p-12 text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-slate-600" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">暂无记录</h3>
            <p className="text-slate-400 mb-6">您还没有参与过任何测评，或者没有匹配的搜索结果。</p>
            <Button 
              onClick={() => navigate('/contests')}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              去参加测评
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredHistory.map((record: JudgeHistory) => (
              <Card 
                key={record.workflow_run_id}
                className="bg-slate-900/40 border-slate-800 hover:border-slate-700 transition-all group overflow-hidden cursor-pointer"
                onClick={() => navigate(`/result/${record.workflow_run_id}`)}
              >
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row md:items-center">
                    {/* 状态指示条 */}
                    <div className={`w-full md:w-1.5 h-1.5 md:h-20 ${
                      record.status === 'success' || record.status === 'succeeded' ? 'bg-emerald-500' : 
                      record.status === 'running' ? 'bg-blue-500' : 'bg-red-500'
                    }`} />
                    
                    <div className="flex-1 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="mt-1">
                          {getStatusIcon(record.status)}
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-white group-hover:text-cyan-400 transition-colors line-clamp-1">
                            {record.filename}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {record.created_at}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5" />
                              {contestMap[record.contest_id] || record.contest_id}
                            </span>
                            {record.elapsed_time > 0 && (
                              <span className="flex items-center gap-1.5">
                                <Timer className="w-3.5 h-3.5" />
                                {record.elapsed_time.toFixed(1)}s
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          {getStatusBadge(record.status)}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-cyan-500 transition-colors" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
