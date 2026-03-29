import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  History
} from 'lucide-react';
import { adminApi } from '@/api/admin';
import { judgeApi } from '@/api/judge';
import { useHistoryStore } from '@/stores/historyStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { Contest } from '@/types';

interface BatchFile {
  file: File;
  status: 'idle' | 'uploading' | 'submitting' | 'done' | 'error';
  progress: number;
  error?: string;
  workflowRunId?: string;
}

export function StartPage() {
  const navigate = useNavigate();
  const { addRecord } = useHistoryStore();
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

  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(f => !batchFiles.find(bf => bf.file.name === f.name));
    setBatchFiles(prev => [
      ...prev,
      ...validFiles.map(f => ({ file: f, status: 'idle' as const, progress: 0 }))
    ]);
  };

  const removeFile = (index: number) => {
    setBatchFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 批量启动评审
  const startBatchJudge = async () => {
    if (batchFiles.length === 0 || !selectedContestId) return;
    setIsProcessing(true);

    try {
      const uploadedFilenames: string[] = [];
      const contest = contests.find((c) => c.id === selectedContestId);

      for (let i = 0; i < batchFiles.length; i++) {
        const bf = batchFiles[i];
        if (bf.status === 'done') {
            uploadedFilenames.push((bf as any).uploadedName);
            continue;
        }

        setBatchFiles(prev => {
          const next = [...prev];
          next[i] = { ...next[i], status: 'uploading', progress: 30 };
          return next;
        });

        try {
          const uploadRes = await judgeApi.uploadFile(bf.file);
          uploadedFilenames.push(uploadRes.filename);

          setBatchFiles(prev => {
            const next = [...prev];
            next[i] = { ...next[i], status: 'submitting', progress: 60, uploadedName: uploadRes.filename } as any;
            return next;
          });
        } catch (err: any) {
          setBatchFiles(prev => {
            const next = [...prev];
            next[i] = { ...next[i], status: 'error', error: '上传失败' };
            return next;
          });
        }
      }

      const validFilenames = uploadedFilenames.filter(f => f);
      if (validFilenames.length === 0) throw new Error('没有成功上传的文件');

      const batchResults = await judgeApi.submitBatchJudge(selectedContestId, validFilenames);

      setBatchFiles(prev => {
        return prev.map(bf => {
          const res = batchResults.find(r => r.filename === (bf as any).uploadedName);
          if (res) {
            addRecord({
              id: res.workflow_run_id,
              filename: bf.file.name,
              contestName: contest ? contest.name : '未知竞赛',
              time: new Date().toLocaleTimeString(),
            });
            return { ...bf, status: 'done', progress: 100, workflowRunId: res.workflow_run_id };
          }
          return bf;
        });
      });

    } catch (e: any) {
      alert(e.response?.data?.detail || e.message || '操作失败');
    } finally {
      setIsProcessing(false);
    }
  };

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

  const allDone = batchFiles.length > 0 && batchFiles.every(f => f.status === 'done');

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-slate-200 relative overflow-hidden px-4">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

      <div className="max-w-4xl mx-auto space-y-8 pt-8 pb-20 relative z-10">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white hover:bg-white/10 backdrop-blur-md border border-white/5"
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
                查看历史
            </Button>
            <div className="flex items-center gap-2 text-xs font-mono text-primary animate-pulse">
                <Cpu className="h-3 w-3" />
                SYSTEM READY // AI_CORE_ONLINE
            </div>
          </div>
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent drop-shadow-2xl">
            AI 智能评审系统
          </h1>
          <p className="text-slate-400 text-sm md:text-base font-light tracking-widest uppercase">
            支持自动批量测评
          </p>
        </div>

        <Card className="bg-slate-900/50 backdrop-blur-xl border-white/10 shadow-2xl ring-1 ring-white/5">
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
                <div key={category} className="space-y-4">
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
                        onClick={() => !isProcessing && setSelectedContestId(contest.id)}
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

        <Card className={cn(
          "bg-slate-900/50 backdrop-blur-xl border-white/10 shadow-2xl transition-all duration-500",
          !selectedContestId ? "opacity-40 grayscale" : "opacity-100"
        )}>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3 text-white">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-400">
                <FileText className="h-4 w-4" />
              </div>
              第二步：添加待测文档
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 text-center transition-all relative group",
                isDragOver ? "border-primary bg-primary/10" : "border-white/10 hover:border-white/20",
                (!selectedContestId || isProcessing) ? "cursor-not-allowed" : "cursor-pointer"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => selectedContestId && !isProcessing && fileInputRef.current?.click()}
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
                  <p className="font-bold text-lg text-white">点击或拖拽文件添加至列表</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">支持批量上传 PDF / DOCX 文件</p>
                </div>
              </div>

              {(!selectedContestId) && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center rounded-2xl">
                  <div className="bg-black/50 px-4 py-2 rounded-lg border border-white/10 text-primary text-xs font-bold tracking-widest">
                    AWAITING_CONTEST_SELECTION
                  </div>
                </div>
              )}
            </div>

            {/* File List */}
            {batchFiles.length > 0 && (
              <div className="space-y-3 pt-4">
                <div className="flex items-center justify-between px-2 text-xs font-mono text-slate-500 uppercase tracking-widest">
                  <span>文件队列 ({batchFiles.length})</span>
                  <button
                    onClick={() => !isProcessing && setBatchFiles([])}
                    className="hover:text-red-400 transition-colors"
                  >
                    清空列表
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {batchFiles.map((bf, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/5 group relative"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className={cn(
                            "h-5 w-5 flex-shrink-0",
                            bf.status === 'done' ? 'text-emerald-400' :
                            bf.status === 'error' ? 'text-red-400' : 'text-slate-400'
                          )} />
                          <span className="text-sm font-medium truncate text-slate-200">
                            {bf.file.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                           {bf.status === 'done' && (
                             <Button
                               size="icon"
                               variant="ghost"
                               className="h-7 w-7 text-cyan-400 hover:text-cyan-300"
                               onClick={() => navigate(`/result/${bf.workflowRunId}`)}
                             >
                               <ChevronRight className="h-4 w-4" />
                             </Button>
                           )}
                           {!isProcessing && bf.status !== 'done' && (
                             <button
                               onClick={() => removeFile(idx)}
                               className="text-slate-500 hover:text-red-400"
                             >
                               <X className="h-4 w-4" />
                             </button>
                           )}
                        </div>
                      </div>

                      {bf.status !== 'idle' && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className={cn(
                              bf.status === 'error' ? 'text-red-400' : 'text-primary'
                            )}>
                              {bf.status === 'uploading' && '正在上传...'}
                              {bf.status === 'submitting' && '正在提交评审...'}
                              {bf.status === 'done' && '评审任务已启动'}
                              {bf.status === 'error' && (bf.error || '失败')}
                            </span>
                            <span>{bf.progress}%</span>
                          </div>
                          <Progress value={bf.progress} className="h-1 bg-white/5" />
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
          {allDone ? (
            <Button
              size="lg"
              className="w-full md:w-80 h-16 text-xl font-black uppercase tracking-[0.2em] bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_40px_rgba(16,185,129,0.4)]"
              onClick={() => navigate('/history')}
            >
              查看测评结果
              <History className="ml-3 h-5 w-5" />
            </Button>
          ) : (
            <Button
              size="lg"
              className={cn(
                "w-full md:w-80 h-16 text-xl font-black uppercase tracking-[0.2em] transition-all duration-500 group relative overflow-hidden",
                "bg-primary hover:bg-blue-400 text-white shadow-[0_0_40px_rgba(59,130,246,0.4)]",
                "disabled:opacity-20 disabled:grayscale"
              )}
              onClick={startBatchJudge}
              disabled={batchFiles.length === 0 || !selectedContestId || isProcessing}
            >
              <span className="relative z-10 flex items-center">
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                    正在处理队列...
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

          {batchFiles.length > 0 && !isProcessing && !allDone && (
            <button
                onClick={() => setBatchFiles([])}
                className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-2 uppercase tracking-widest font-mono"
            >
                <ListRestart className="h-3 w-3" />
                重置当前队列
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChevronRight(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
