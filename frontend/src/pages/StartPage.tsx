import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Upload, Check, AlertCircle, Loader2, ArrowLeft, FileText, Cpu, Sparkles } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { judgeApi } from '@/api/judge';
import { useHistoryStore } from '@/stores/historyStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Contest } from '@/types';

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
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const startJudge = async () => {
    if (!file || !selectedContestId) return;
    setSubmitting(true);
    try {
      const uploadRes = await judgeApi.uploadFile(file);
      if (!uploadRes?.filename) throw new Error('上传失败');
      const judgeRes = await judgeApi.submitJudge(selectedContestId, uploadRes.filename);
      const contest = contests.find((c) => c.id === selectedContestId);
      addRecord({
        id: judgeRes.workflow_run_id,
        filename: file.name,
        contestName: contest ? contest.name : '未知竞赛',
        time: new Date().toLocaleTimeString(),
      });
      navigate(`/result/${judgeRes.workflow_run_id}`);
    } catch (e: any) {
      alert(e.response?.data?.detail || e.message || '操作失败');
    } finally {
      setSubmitting(false);
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
      setFile(e.dataTransfer.files[0]);
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
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回中心
          </Button>
          <div className="flex items-center gap-2 text-xs font-mono text-primary animate-pulse">
            <Cpu className="h-3 w-3" />
            SYSTEM READY // AI_CORE_ONLINE
          </div>
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent drop-shadow-2xl">
            AI 智能评审系统
          </h1>
          <p className="text-slate-400 text-sm md:text-base font-light tracking-widest uppercase">
            Neural Evaluation & Deep Analysis Protocol
          </p>
        </div>

        <Card className="bg-slate-900/50 backdrop-blur-xl border-white/10 shadow-2xl ring-1 ring-white/5">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3 text-white">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 border border-primary/50 text-primary shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                <Sparkles className="h-4 w-4 stroke-blue-50" />
              </div>
              第一步：选择竞赛
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-10">
            {loadingContests ? (
              <div className="flex justify-center p-12"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
            ) : (
              Object.entries(groupedContests).map(([category, items]) => (
                <div key={category} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/80 bg-primary/5 px-3 py-1 rounded-full border border-primary/20">
                      {category}
                    </span>
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>

                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-white bg-primary/20 px-4 py-1.5 rounded-full border border-primary/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                      {category}
                    </span>

                    <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {items.map((contest: Contest) => (
                      <div
                        key={contest.id}
                        onClick={() => setSelectedContestId(contest.id)}
                        className={cn(
                          "group relative p-6 rounded-2xl border transition-all duration-500 cursor-pointer overflow-hidden",
                          selectedContestId === contest.id
                            ? "bg-primary/20 border-primary shadow-[0_0_20px_rgba(59,130,246,0.3)] scale-[1.02]"
                            : "bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10"
                        )}
                      >
                        {selectedContestId === contest.id && (
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent animate-in fade-in duration-500" />
                        )}

                        <div className={cn(
                          "relative z-10 text-sm font-bold text-center transition-colors duration-300",
                          selectedContestId === contest.id ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                        )}>
                          {contest.name}
                        </div>

                        {selectedContestId === contest.id && (
                          <div className="absolute top-2 right-2 text-primary">
                            <Check className="h-4 w-4" />
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
              第二步：上传竞赛文档
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "border-2 border-dashed rounded-3xl p-12 text-center transition-all relative group overflow-hidden",
                isDragOver ? "border-primary bg-primary/10 scale-[0.99]" : "border-white/10 hover:border-white/30",
                !selectedContestId ? "cursor-not-allowed" : "cursor-pointer"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => selectedContestId && fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.length && setFile(e.target.files[0])}
                className="hidden"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
              />

              {!file ? (
                <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse"></div>
                    <div className="relative p-6 rounded-2xl bg-slate-800 border border-white/10 text-primary group-hover:rotate-12 transition-transform duration-500">
                      <Upload className="h-12 w-12" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="font-bold text-xl text-white tracking-tight">拖拽文件至此</p>
                    <p className="text-xs text-slate-500 font-mono tracking-tighter">SUPPORTED: PDF / DOCX / PPTX (最大 20MB)</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-6 animate-in zoom-in-95">
                  <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                    <FileText className="h-12 w-12" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-emerald-400 text-lg">{file.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB // READY_FOR_UPLOADING</p>
                  </div>
                </div>
              )}

              {!selectedContestId && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center">
                  <div className="bg-black/50 px-6 py-3 rounded-xl border border-white/10 text-primary font-bold text-sm tracking-widest animate-bounce">
                    AWAITING_STEP_1_COMPLETION
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col items-center gap-6 pt-6">
          <Button
            size="lg"
            className={cn(
              "w-full md:w-80 h-16 text-xl font-black uppercase tracking-[0.2em] transition-all duration-500 group relative overflow-hidden",
              "bg-primary hover:bg-blue-400 text-white shadow-[0_0_40px_rgba(59,130,246,0.4)]",
              "disabled:opacity-20 disabled:grayscale"
            )}
            onClick={startJudge}
            disabled={!file || !selectedContestId || submitting}
          >
            <span className="relative z-10 flex items-center">
              {submitting ? (
                <>
                  <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                  正在解析文档...
                </>
              ) : (
                <>
                  启动 AI 评分
                  <Sparkles className="ml-3 h-5 w-5 group-hover:animate-ping" />
                </>
              )}
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          </Button>

          <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/5 backdrop-blur-sm">
            <AlertCircle className="h-4 w-4 text-primary" />
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium pr-4">
              奇创 · 2026 All Copyright
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
