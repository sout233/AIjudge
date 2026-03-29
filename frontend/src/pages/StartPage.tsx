import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  Check,
  AlertCircle,
  Loader2,
  ArrowLeft,
  FileText,
  Cpu,
  Sparkles,
  X,
  ListRestart,
  History,
  ExternalLink
} from 'lucide-react';
import { adminApi } from '@/api/admin';
import { judgeApi } from '@/api/judge';
import { useHistoryStore } from '@/stores/historyStore';
import { useBatchStore, type BatchFile } from '@/stores/batchStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { Contest } from '@/types';

export function StartPage() {
  const navigate = useNavigate();
  const { addRecord } = useHistoryStore();
  const {
    currentBatch,
    selectedContestId,
    isProcessing,
    setContestId,
    setFiles,
    updateFileStatus,
    setIsProcessing,
    clearBatch
  } = useBatchStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: contests = [], isLoading: loadingContests } = useQuery({
    queryKey: ['contests'],
    queryFn: adminApi.getContests,
  });

  const groupedContests = useMemo(() => {
    const groups: Record<string, Contest[]> = {};
    contests.forEach((contest) => {
      const cat = contest.category || "其他";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(contest);
    });
    return groups;
  }, [contests]);

  const [isDragOver, setIsDragOver] = useState(false);

  // 拦截逻辑
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isProcessing && currentLocation.pathname !== nextLocation.pathname
  );

  const pollFileStatus = async (workflowRunId: string, fileId: string) => {
    const poll = async () => {
      try {
        const res = await judgeApi.getStatus(workflowRunId);

        if (res.status === 'success' || res.status === 'succeeded') {
          updateFileStatus(fileId, { status: 'success', progress: 100 });
          return true;
        } else if (res.status === 'failed' || res.status === 'error') {
          updateFileStatus(fileId, { status: 'failed', progress: 100, error: res.error || '测评失败' });
          return true;
        } else {
          updateFileStatus(fileId, { status: 'processing', progress: 80 });
          return false;
        }
      } catch (err) {
        console.error('Polling error:', err);
        return false;
      }
    };

    const isDone = await poll();
    if (isDone) return;

    const interval = setInterval(async () => {
      const isDone = await poll();
      if (isDone) clearInterval(interval);
    }, 3000);
  };

  useEffect(() => {
    currentBatch.forEach(bf => {
      if ((bf.status === 'submitting' || bf.status === 'processing') && bf.workflowRunId) {
        pollFileStatus(bf.workflowRunId, bf.id);
      }
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(f => !currentBatch.find(bf => bf.filename === f.name));
    const newBatch: BatchFile[] = validFiles.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      filename: f.name,
      status: 'idle',
      progress: 0
    }));
    setFiles([...currentBatch, ...newBatch]);
  };

  const removeFile = (id: string) => {
    setFiles(currentBatch.filter(f => f.id !== id));
  };

  const startBatchJudge = async () => {
    if (currentBatch.length === 0 || !selectedContestId) return;
    setIsProcessing(true);

    try {
      const contest = contests.find((c) => c.id === selectedContestId);
      const uploadedNames: Record<string, string> = {};

      for (const bf of currentBatch) {
        if (bf.status === 'success' || bf.status === 'processing') continue;
        if (!bf.file) continue;

        updateFileStatus(bf.id, { status: 'uploading', progress: 20 });
        try {
          const uploadRes = await judgeApi.uploadFile(bf.file);
          uploadedNames[bf.id] = uploadRes.filename;
          updateFileStatus(bf.id, { status: 'submitting', progress: 50, uploadedName: uploadRes.filename });
        } catch (err) {
          updateFileStatus(bf.id, { status: 'error', error: '上传失败' });
        }
      }
// 准备批量提交
const pendingPairs = currentBatch
  .filter(bf => uploadedNames[bf.id])
  .map(bf => ({
      id: bf.id,
      filename: uploadedNames[bf.id],
      original_filename: bf.filename
  }));

if (pendingPairs.length > 0) {
  const batchResults = await judgeApi.submitBatchJudge(
      selectedContestId,
      pendingPairs.map(p => ({
          filename: p.filename,
          original_filename: p.original_filename
      }))
  );

        batchResults.forEach(res => {
          const pair = pendingPairs.find(p => p.filename === res.filename);
          if (pair) {
            updateFileStatus(pair.id, {
              status: 'processing',
              progress: 60,
              workflowRunId: res.workflow_run_id
            });

            addRecord({
              id: res.workflow_run_id,
              filename: currentBatch.find(f => f.id === pair.id)?.filename || res.filename,
              contestName: contest ? contest.name : '未知竞赛',
              time: new Date().toLocaleTimeString(),
            });

            // 启动独立轮询
            pollFileStatus(res.workflow_run_id, pair.id);
          }
        });
      }
    } catch (e: any) {
      alert(e.response?.data?.detail || e.message || '批量提交失败');
      setIsProcessing(false);
    }
  };

  const allFinished = currentBatch.length > 0 && currentBatch.every(f => f.status === 'success' || f.status === 'failed' || f.status === 'error');
  const hasProcessing = currentBatch.some(f => f.status === 'uploading' || f.status === 'submitting' || f.status === 'processing');

  useEffect(() => {
    if (isProcessing && allFinished) {
      setIsProcessing(false);
    }
  }, [allFinished, isProcessing]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (selectedContestId) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (selectedContestId && e.dataTransfer.files?.length) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-slate-200 relative overflow-hidden px-4">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

      <div className="max-w-4xl mx-auto space-y-8 pt-8 pb-20 relative z-10">
        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white hover:bg-white/10 backdrop-blur-md border border-white/5"
            disabled={isProcessing}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回中心
          </Button>
          <div className="flex items-center gap-4">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/history')}
                className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
            >
                <History className="mr-2 h-4 w-4" />
                测评历史
            </Button>
          </div>
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent drop-shadow-2xl">
            AI 批量评审中心
          </h1>
          <p className="text-slate-400 text-sm md:text-base font-light tracking-widest uppercase">
            支持自动批量测评
          </p>
        </div>

        {/* Step 1: Contest Selection */}
        <Card className={cn(
            "bg-slate-900/50 backdrop-blur-xl border-white/10 shadow-2xl ring-1 ring-white/5 transition-opacity",
            hasProcessing && "opacity-50 pointer-events-none"
        )}>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3 text-white">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 border border-primary/50 text-primary shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                <Sparkles className="h-4 w-4 stroke-blue-50" />
              </div>
              第一步：选择目标竞赛
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingContests ? (
              <div className="flex justify-center p-12"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
            ) : (
              Object.entries(groupedContests).map(([category, items]) => (
                <div key={category} className="space-y-4"  key={category}>
                  <div className="flex items-center gap-3">
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-white bg-primary/20 px-4 py-1.5 rounded-full border border-primary/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                      {category}
                    </span>
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {items.map((contest: Contest) => (
                      <div
                        key={contest.id}
                        onClick={() => setContestId(contest.id)}
                        className={cn(
                          "group relative p-4 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden",
                          selectedContestId === contest.id
                            ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                            : "bg-white/5 border-white/5 hover:border-white/20"
                        )}
                      >
                        <div className={cn(
                          "relative z-10 text-sm font-bold text-center",
                          selectedContestId === contest.id ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                        )}>
                          {contest.name}
                        </div>
                        {selectedContestId === contest.id && (
                          <div className="absolute top-1 right-1 text-primary">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Step 2: Files */}
        <Card className={cn(
          "bg-slate-900/50 backdrop-blur-xl border-white/10 shadow-2xl transition-all duration-500",
          !selectedContestId ? "opacity-40 grayscale" : "opacity-100"
        )}>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3 text-white">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-400">
                <FileText className="h-4 w-4" />
              </div>
              第二步：待测评文档
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {!hasProcessing && (
                <div
                className={cn(
                    "border-2 border-dashed rounded-2xl p-8 text-center transition-all relative group",
                    isDragOver ? "border-primary bg-primary/10" : "border-white/10 hover:border-white/20",
                    !selectedContestId ? "cursor-not-allowed" : "cursor-pointer"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => selectedContestId && fileInputRef.current?.click()}
                >
                <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                />
                <div className="flex flex-col items-center gap-4">
                    <div className="p-4 rounded-xl bg-slate-800 text-primary group-hover:scale-110 transition-transform">
                    <Upload className="h-8 w-8" />
                    </div>
                    <div>
                    <p className="font-bold text-lg text-white">添加测评文件</p>
                    <p className="text-xs text-slate-500 font-mono mt-1">支持多选 PDF / DOCX 格式</p>
                    </div>
                </div>
                {!selectedContestId && (
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center rounded-2xl">
                    <div className="bg-black/50 px-4 py-2 rounded-lg border border-white/10 text-primary text-xs font-bold tracking-widest">
                        AWAITING_CONTEST_SELECTION
                    </div>
                    </div>
                )}
                </div>
            )}

            {/* File List */}
            {currentBatch.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2 text-xs font-mono text-slate-500 uppercase tracking-widest">
                  <span>评审队列 ({currentBatch.length})</span>
                  {!hasProcessing && (
                    <button
                        onClick={() => clearBatch()}
                        className="hover:text-red-400 transition-colors"
                    >
                        清空队列
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {currentBatch.map((bf) => (
                    <div
                      key={bf.id}
                      className="flex flex-col gap-2 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className={cn(
                            "h-5 w-5 flex-shrink-0",
                            bf.status === 'success' ? 'text-emerald-400' :
                            bf.status === 'failed' || bf.status === 'error' ? 'text-red-400' :
                            bf.status === 'idle' ? 'text-slate-500' : 'text-blue-400'
                          )} />
                          <span className="text-sm font-medium truncate text-slate-200">
                            {bf.filename}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                           {(bf.status === 'success' || bf.status === 'processing') && bf.workflowRunId && (
                             <Button
                               size="sm"
                               variant="ghost"
                               className="h-8 text-[10px] text-cyan-400 hover:text-cyan-300 gap-1"
                               onClick={() => navigate(`/result/${bf.workflowRunId}`)}
                             >
                               {bf.status === 'success' ? '查看报告' : '中间结果'}
                               <ExternalLink className="h-3 w-3" />
                             </Button>
                           )}
                           {!hasProcessing && (
                             <button
                               onClick={() => removeFile(bf.id)}
                               className="text-slate-500 hover:text-red-400 p-1"
                             >
                               <X className="h-4 w-4" />
                             </button>
                           )}
                        </div>
                      </div>

                      {bf.status !== 'idle' && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[12px] font-mono">
                            <span className={cn(
                              (bf.status === 'failed' || bf.status === 'error') ? 'text-red-400' :
                              bf.status === 'success' ? 'text-emerald-400' : 'text-blue-400'
                            )}>
                              {bf.status === 'uploading' && '正在上传文件...'}
                              {bf.status === 'submitting' && '正在分发任务...'}
                              {bf.status === 'processing' && 'AI 正在深度评审中...'}
                              {bf.status === 'success' && '测评完成'}
                              {bf.status === 'failed' && (bf.error || '测评失败')}
                              {bf.status === 'error' && '异常中断'}
                            </span>
                            <span className='text-blue-100'>{bf.progress}%</span>
                          </div>
                          <Progress value={bf.progress} className={cn(
                              "h-1.5 bg-white/5",
                              bf.status === 'success' ? "[&>div]:bg-emerald-500" :
                              (bf.status === 'failed' || bf.status === 'error') ? "[&>div]:bg-red-500" : ""
                          )} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col items-center gap-6 pt-6">
          {allFinished ? (
            <div className="flex flex-col items-center gap-4 w-full md:w-80">
                <Button
                    size="lg"
                    className="w-full h-16 text-xl font-black uppercase tracking-[0.2em] bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_40px_rgba(16,185,129,0.4)]"
                    onClick={() => navigate('/history')}
                >
                    全部完成，查看列表
                    <History className="ml-3 h-5 w-5" />
                </Button>
                <button
                    onClick={() => { clearBatch(); setContestId(null); }}
                    className="w-full text-md p-2 border rounded-md bg-white text-black hover:bg-white/90"
                >
                    发起新测评
                </button>
            </div>
          ) : (
            <Button
              size="lg"
              className={cn(
                "w-full md:w-80 h-16 text-xl font-black uppercase tracking-[0.2em] transition-all duration-500 group relative overflow-hidden",
                "bg-primary hover:bg-blue-400 text-white shadow-[0_0_40px_rgba(59,130,246,0.4)]",
                "disabled:opacity-20 disabled:grayscale"
              )}
              onClick={startBatchJudge}
              disabled={currentBatch.length === 0 || !selectedContestId || hasProcessing}
            >
              <span className="relative z-10 flex items-center">
                {hasProcessing ? (
                  <>
                    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                    AI 正在评审...
                  </>
                ) : (
                  <>
                    启动批量评审
                    <Sparkles className="ml-3 h-5 w-5" />
                  </>
                )}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* 路由拦截弹窗 */}
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="max-w-md w-full bg-slate-900 border-white/10 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-3 text-white">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                测评正在进行
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-slate-400 text-sm leading-relaxed">
                批量评审任务正在运行中，此时离开可能会导致无法在当前页面实时跟踪进度。确定要离开吗？（任务在后台仍会继续完成）
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-white/10 text-slate-400 hover:text-white"
                  onClick={() => blocker.reset?.()}
                >
                  留下观察
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 bg-red-600 hover:bg-red-500"
                  onClick={() => blocker.proceed?.()}
                >
                  确定离开
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
