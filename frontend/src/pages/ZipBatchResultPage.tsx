import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Download, 
  ArrowLeft, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ExternalLink,
  RefreshCw,
  Trophy,
  BarChart3,
  FileArchive,
  Package,
  AlertTriangle
} from 'lucide-react';
import { judgeApi } from '@/api/judge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ZipBatchTask {
  filename: string;
  original_name: string;
  status: string;
  error: string | null;
  workflow_run_id: string;
}

interface ZipBatchStatus {
  manifest_id: string;
  type: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
  progress: string;
  tasks: ZipBatchTask[];
}

export function ZipBatchResultPage() {
  const { manifestId } = useParams<{ manifestId: string }>();
  const navigate = useNavigate();
  
  const [status, setStatus] = useState<ZipBatchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 轮询状态
  useEffect(() => {
    if (!manifestId) return;

    const fetchStatus = async () => {
      try {
        const data = await judgeApi.getZipBatchStatus(manifestId);
        setStatus(data);
        setError(null);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } }; message?: string };
        setError(err.response?.data?.detail || err.message || '获取状态失败');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    // 如果还有任务未完成，继续轮询
    const interval = setInterval(() => {
      if (status && (status.pending > 0 || status.running > 0)) {
        fetchStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [manifestId]);

  const getStatusIcon = (taskStatus: string) => {
    switch (taskStatus) {
      case 'success':
      case 'succeeded':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'error':
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />;
      case 'pending':
      default:
        return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusText = (taskStatus: string) => {
    switch (taskStatus) {
      case 'success':
      case 'succeeded':
        return '评审完成';
      case 'error':
      case 'failed':
        return '评审失败';
      case 'running':
        return '评审中...';
      case 'pending':
        return '等待中...';
      default:
        return '未知状态';
    }
  };

  const getStatusBadgeVariant = (taskStatus: string) => {
    switch (taskStatus) {
      case 'success':
      case 'succeeded':
        return 'default';
      case 'error':
      case 'failed':
        return 'destructive';
      case 'running':
        return 'secondary';
      case 'pending':
      default:
        return 'outline';
    }
  };

  const progressPercentage = status 
    ? Math.round(((status.completed + status.failed) / status.total) * 100)
    : 0;

  const downloadPdf = async (workflowRunId: string, filename: string) => {
    try {
      const blob = await judgeApi.downloadPdf(workflowRunId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${filename}_${workflowRunId.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('下载失败');
    }
  };

  const downloadAllPdfs = async () => {
    if (!status) return;
    const completedTasks = status.tasks.filter(t => t.status === 'success' || t.status === 'succeeded');
    
    for (const task of completedTasks) {
      await downloadPdf(task.workflow_run_id, task.original_name);
      // 添加小延迟避免浏览器限制
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-400 mb-4">{error}</p>
          <Button onClick={() => navigate('/judge')} variant="outline">
            返回提交页面
          </Button>
        </div>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      {/* 背景装饰 */}
      <div className="fixed inset-0 bg-gradient-to-br from-cyan-900/10 via-slate-900 to-purple-900/10 pointer-events-none" />
      
      {/* Header */}
      <header className="relative z-10 border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/judge')} 
            className="text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回提交
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <Trophy className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              灵审云评 <span className="text-cyan-400">/</span> ZIP 批量评审
            </span>
          </div>
          <div className="w-[100px]" />
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        {/* 页面标题 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px w-8 bg-cyan-500" />
            <span className="text-xs font-bold tracking-widest text-cyan-500 uppercase">ZIP Batch Processing</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
            ZIP 批量评审任务监控
          </h1>
          <p className="text-slate-400">
            实时监控 ZIP 压缩包内所有文件的评审进度，系统会自动解压并逐个进行评审（最多3个并发）
          </p>
        </div>

        {/* 总体进度概览 */}
        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm mb-8">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <FileArchive className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">ZIP 批量任务</h2>
                  <p className="text-sm text-slate-500">
                    任务清单 ID: {status.manifest_id.slice(0, 16)}...
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-bold text-white">{progressPercentage}%</span>
              </div>
            </div>
            
            <div className="relative">
              <Progress 
                value={progressPercentage} 
                className="h-3 bg-slate-800"
              />
              {progressPercentage < 100 && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                </div>
              )}
            </div>

            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-4 mt-6">
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">总文件数</span>
                </div>
                <p className="text-2xl font-bold text-white">{status.total}</p>
              </div>
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-slate-400">已完成</span>
                </div>
                <p className="text-2xl font-bold text-green-400">{status.completed}</p>
              </div>
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-slate-400">失败</span>
                </div>
                <p className="text-2xl font-bold text-red-400">{status.failed}</p>
              </div>
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-cyan-500" />
                  <span className="text-sm text-slate-400">进行中</span>
                </div>
                <p className="text-2xl font-bold text-cyan-400">{status.running + status.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 任务列表 */}
        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              文件评审详情
              <Badge variant="outline" className="ml-2 text-slate-400 border-slate-700">
                {status.total} 个文件
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {status.tasks.map((task, index) => (
                <div 
                  key={task.workflow_run_id}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                    task.status === 'success' || task.status === 'succeeded'
                      ? "bg-green-500/5 border-green-500/20" :
                    task.status === 'error' || task.status === 'failed'
                      ? "bg-red-500/5 border-red-500/20" :
                    task.status === 'running'
                      ? "bg-cyan-500/5 border-cyan-500/20" :
                    "bg-slate-950/50 border-slate-800"
                  )}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-mono text-slate-500">#{index + 1}</span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-white truncate">
                          {task.original_name}
                        </p>
                        <Badge variant={getStatusBadgeVariant(task.status)} className="text-xs">
                          {getStatusText(task.status)}
                        </Badge>
                      </div>
                      
                      {task.error && (
                        <p className="text-xs text-red-400 truncate">{task.error}</p>
                      )}
                      
                      <p className="text-xs font-mono text-slate-600">
                        ID: {task.workflow_run_id.slice(0, 16)}...
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getStatusIcon(task.status)}
                    
                    {(task.status === 'success' || task.status === 'succeeded') && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/result/${task.workflow_run_id}`)}
                          className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10"
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          详情
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadPdf(task.workflow_run_id, task.original_name)}
                          className="text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {status.tasks.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-500">暂无任务</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 底部操作 */}
        <div className="flex justify-center gap-4 mt-8">
          <Button
            variant="outline"
            onClick={() => navigate('/judge')}
            className="border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
          >
            提交新任务
          </Button>
          {status.completed > 0 && (
            <Button
              onClick={downloadAllPdfs}
              className="bg-cyan-600 hover:bg-cyan-500"
            >
              <Download className="w-4 h-4 mr-2" />
              下载全部报告 ({status.completed})
            </Button>
          )}
        </div>
      </main>

      {/* 页脚 */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-900 mt-20 text-center">
        <p className="text-[9px] text-slate-600 tracking-widest font-mono uppercase">
          鄂ICP备2026012182号-1 • AI Judging Engine v2.0
        </p>
      </footer>
    </div>
  );
}
