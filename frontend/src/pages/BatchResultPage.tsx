import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Download, 
  FileText, 
  ArrowLeft, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ExternalLink,
  RefreshCw,
  Trophy,
  BarChart3
} from 'lucide-react';
import { judgeApi } from '@/api/judge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { JudgeStatusResponse } from '@/types';
import { getJudgeSummaryScore, parseJudgeResult } from '@/lib/judge-result';

interface BatchItem {
  workflowRunId: string;
  status: JudgeStatusResponse['status'];
  progress?: string;
  result?: {
    total_score: number;
    max_score: number;
  };
  isLoading: boolean;
}

export function BatchResultPage() {
  const { workflowRunIds } = useParams<{ workflowRunIds: string }>();
  const navigate = useNavigate();
  
  const workflowIds = useMemo(() => {
    return workflowRunIds?.split(',').filter(Boolean) || [];
  }, [workflowRunIds]);

  const [items, setItems] = useState<BatchItem[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);

  // 初始化 items
  useEffect(() => {
    setItems(workflowIds.map(id => ({
      workflowRunId: id,
      status: 'running',
      isLoading: true,
    })));
  }, [workflowIds]);

  // 轮询所有任务状态
  useEffect(() => {
    if (items.length === 0) return;

    const pollStatuses = async () => {
      const updatedItems = await Promise.all(
        items.map(async (item) => {
          if (item.status === 'succeeded' || item.status === 'success' || item.status === 'error' || item.status === 'failed') {
            return item;
          }

          try {
            const status = await judgeApi.getStatus(item.workflowRunId);
            const parsedResult = parseJudgeResult(status);
            const summaryScore = parsedResult ? getJudgeSummaryScore(parsedResult) : undefined;
            return {
              ...item,
              status: status.status,
              progress: status.progress,
              result: summaryScore
                ? {
                    total_score: summaryScore.totalScore,
                    max_score: summaryScore.maxScore,
                  }
                : undefined,
              isLoading: status.status === 'running' || status.status === 'pending',
            };
          } catch (error) {
            return { ...item, status: 'error' as const, isLoading: false };
          }
        })
      );

      setItems(updatedItems);

      // 计算总体进度
      const completed = updatedItems.filter(i => 
        i.status === 'succeeded' || i.status === 'success' || i.status === 'error' || i.status === 'failed'
      ).length;
      setOverallProgress(Math.round((completed / updatedItems.length) * 100));

      // 如果全部完成，停止轮询
      const allCompleted = updatedItems.every(i => 
        i.status === 'succeeded' || i.status === 'success' || i.status === 'error' || i.status === 'failed'
      );

      return !allCompleted;
    };

    let intervalId: ReturnType<typeof setInterval>;
    
    const startPolling = async () => {
      const shouldContinue = await pollStatuses();
      if (shouldContinue) {
        intervalId = setInterval(async () => {
          const continuePolling = await pollStatuses();
          if (!continuePolling) {
            clearInterval(intervalId);
          }
        }, 2000);
      }
    };

    startPolling();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [items.length]); // 只在 items.length 变化时重新设置

  const getStatusIcon = (status: BatchItem['status']) => {
    switch (status) {
      case 'succeeded':
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'error':
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
      case 'pending':
      default:
        return <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />;
    }
  };

  const getStatusText = (status: BatchItem['status']) => {
    switch (status) {
      case 'succeeded':
      case 'success':
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

  const getStatusBadgeVariant = (status: BatchItem['status']) => {
    switch (status) {
      case 'succeeded':
      case 'success':
        return 'default';
      case 'error':
      case 'failed':
        return 'destructive';
      case 'running':
      case 'pending':
      default:
        return 'secondary';
    }
  };

  const completedCount = items.filter(i => 
    i.status === 'succeeded' || i.status === 'success'
  ).length;
  const failedCount = items.filter(i => 
    i.status === 'error' || i.status === 'failed'
  ).length;
  const runningCount = items.filter(i => 
    i.status === 'running' || i.status === 'pending'
  ).length;

  const downloadPdf = async (workflowRunId: string) => {
    try {
      const blob = await judgeApi.downloadPdf(workflowRunId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${workflowRunId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('下载失败');
    }
  };

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
              灵审云评 <span className="text-cyan-400">/</span> 批量评审
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
            <span className="text-xs font-bold tracking-widest text-cyan-500 uppercase">Batch Processing</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
            批量评审任务监控
          </h1>
          <p className="text-slate-400">
            实时监控所有文件的评审进度，评审完成后可查看详细报告
          </p>
        </div>

        {/* 总体进度概览 */}
        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm mb-8">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <BarChart3 className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">总体进度</h2>
                  <p className="text-sm text-slate-500">
                    {completedCount} 完成 / {failedCount} 失败 / {runningCount} 进行中
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-bold text-white">{overallProgress}%</span>
              </div>
            </div>
            
            <div className="relative">
              <Progress 
                value={overallProgress} 
                className="h-3 bg-slate-800"
              />
              {overallProgress < 100 && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                </div>
              )}
            </div>

            {/* 统计卡片 */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-slate-400">已完成</span>
                </div>
                <p className="text-2xl font-bold text-white">{completedCount}</p>
              </div>
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-slate-400">失败</span>
                </div>
                <p className="text-2xl font-bold text-white">{failedCount}</p>
              </div>
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-cyan-500" />
                  <span className="text-sm text-slate-400">进行中</span>
                </div>
                <p className="text-2xl font-bold text-white">{runningCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 任务列表 */}
        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <FileText className="w-5 h-5 text-cyan-400" />
              任务详情
              <Badge variant="outline" className="ml-2 text-slate-400 border-slate-700">
                {items.length} 个文件
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div 
                  key={item.workflowRunId}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                    item.status === 'succeeded' || item.status === 'success' 
                      ? "bg-green-500/5 border-green-500/20" :
                    item.status === 'error' || item.status === 'failed'
                      ? "bg-red-500/5 border-red-500/20" :
                    "bg-slate-950/50 border-slate-800"
                  )}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-mono text-slate-500">#{index + 1}</span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-mono text-slate-500 truncate">
                          {item.workflowRunId.slice(0, 16)}...
                        </p>
                        <Badge variant={getStatusBadgeVariant(item.status)} className="text-xs">
                          {getStatusText(item.status)}
                        </Badge>
                      </div>
                      
                      {item.progress && item.status !== 'succeeded' && item.status !== 'success' && (
                        <p className="text-xs text-slate-500 truncate">{item.progress}</p>
                      )}
                      
                      {item.result && (
                        <p className="text-sm text-green-400">
                          综合得分: <span className="font-bold">{item.result.total_score}</span> / {item.result.max_score}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getStatusIcon(item.status)}
                    
                    {(item.status === 'succeeded' || item.status === 'success') && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/result/${item.workflowRunId}`)}
                          className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10"
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          查看详情
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadPdf(item.workflowRunId)}
                          className="text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          下载
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {items.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
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
          {completedCount > 0 && (
            <Button
              onClick={() => {
                items.forEach(item => {
                  if (item.status === 'succeeded' || item.status === 'success') {
                    downloadPdf(item.workflowRunId);
                  }
                });
              }}
              className="bg-cyan-600 hover:bg-cyan-500"
            >
              <Download className="w-4 h-4 mr-2" />
              批量下载所有报告
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
