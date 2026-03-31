import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Upload, 
  Check, 
  ArrowLeft, 
  FileText, 
  FolderTree, 
  Trophy, 
  Sparkles,
  ChevronRight,
  Cpu,
  Layers,
  File,
  X,
  Trash2,
  AlertCircle,
  FileArchive,
  Package,
  History,
  Zap,
  Loader2,
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
import { Badge } from '@/components/ui/badge';
import { ContestLogo } from '@/components/ContestLogo';

type UploadMode = 'single' | 'multi' | 'zip';

export function StartPage() {
  const navigate = useNavigate();
  const { addRecord } = useHistoryStore();
  const { 
    currentBatch, 
    selectedContestId, 
    selectedTrackId,
    isProcessing,
    setContestId,
    setTrackId,
    setFiles,
    updateFileStatus,
    setIsProcessing,
    clearBatch
  } = useBatchStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMode, setUploadMode] = useState<UploadMode>('multi');
  const [isDragOver, setIsDragOver] = useState(false);

  const { data: contests = [], isLoading: loadingContests } = useQuery({
    queryKey: ['contests'],
    queryFn: adminApi.getContests,
  });

  const selectedContest = useMemo(() => 
    contests.find(c => c.id === selectedContestId), 
  [contests, selectedContestId]);

  const availableTracks = useMemo(() => 
    selectedContest?.tracks || [], 
  [selectedContest]);

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
      } catch (err) { return false; }
    };
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

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (uploadMode === 'zip') {
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.zip')) return alert('请上传 ZIP 格式文件');
        setFiles([{ id: 'zip-placeholder', filename: file.name, file: file, status: 'idle', progress: 0 }]);
    } else {
        const newFiles = Array.from(files);
        const validFiles = newFiles.filter(f => !currentBatch.find(bf => bf.filename === f.name));
        const newBatch: BatchFile[] = validFiles.map(f => ({
            id: Math.random().toString(36).substr(2, 9), file: f, filename: f.name, status: 'idle', progress: 0
        }));
        setFiles(uploadMode === 'single' ? [newBatch[0]] : [...currentBatch, ...newBatch]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedContestId || !selectedTrackId || currentBatch.length === 0) return;
    setIsProcessing(true);
    try {
      if (uploadMode === 'zip') {
        const zipItem = currentBatch[0];
        if (!zipItem.file) return;
        updateFileStatus(zipItem.id, { status: 'uploading', progress: 30 });
        const uploadRes = await judgeApi.uploadFile(zipItem.file);
        const res = await judgeApi.submitZipBatchJudge(selectedContestId, uploadRes.filename, selectedTrackId);
        const tasks: BatchFile[] = res.tasks.map(t => ({
            id: Math.random().toString(36).substr(2, 9), filename: t.filename, status: 'processing', progress: 60, workflowRunId: t.workflow_run_id
        }));
        setFiles(tasks);
        res.tasks.forEach((t, idx) => {
            addRecord({ id: t.workflow_run_id, filename: t.filename, contestName: selectedContest?.name || '竞赛', time: new Date().toLocaleTimeString() });
            pollFileStatus(t.workflow_run_id, tasks[idx].id);
        });
      } else {
        const uploadedNames: Record<string, string> = {};
        for (const bf of currentBatch) {
            if (bf.status === 'success' || bf.status === 'processing' || !bf.file) continue;
            updateFileStatus(bf.id, { status: 'uploading', progress: 20 });
            try {
                const res = await judgeApi.uploadFile(bf.file);
                uploadedNames[bf.id] = res.filename;
                updateFileStatus(bf.id, { status: 'submitting', progress: 50 });
            } catch { updateFileStatus(bf.id, { status: 'error', error: '上传失败' }); }
        }
        const pending = currentBatch.filter(bf => uploadedNames[bf.id]).map(bf => ({
            filename: uploadedNames[bf.id], original_filename: bf.filename
        }));
        if (pending.length > 0) {
            const res = await judgeApi.submitBatchJudge(selectedContestId, pending, selectedTrackId);
            res.tasks.forEach(t => {
                const bf = currentBatch.find(f => uploadedNames[f.id] === t.filename);
                if (bf) {
                    updateFileStatus(bf.id, { status: 'processing', progress: 60, workflowRunId: t.workflow_run_id });
                    addRecord({ id: t.workflow_run_id, filename: bf.filename, contestName: selectedContest?.name || '竞赛', time: new Date().toLocaleTimeString() });
                    pollFileStatus(t.workflow_run_id, bf.id);
                }
            });
        }
      }
    } catch (e: any) {
      alert(e.message || '提交失败');
      setIsProcessing(false);
    }
  };

  const steps = [
    { num: '01', title: '选择竞赛', desc: '选择目标赛事' },
    { num: '02', title: '确认赛道', desc: '确认参赛方向' },
    { num: '03', title: '上传作品', desc: '提交评审文档' },
  ];

  const isReadyToSubmit = selectedTrackId && currentBatch.length > 0 && !isProcessing;
  const allFinished = currentBatch.length > 0 && currentBatch.every(f => ['success', 'failed', 'error'].includes(f.status));
  const hasProcessing = currentBatch.some(f => ['uploading', 'submitting', 'processing'].includes(f.status));

  useEffect(() => { if (isProcessing && allFinished) setIsProcessing(false); }, [allFinished, isProcessing]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/10 via-slate-900 to-purple-900/10" />
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`, backgroundSize: '50px 50px' }} />

      <header className="relative z-50 border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> 返回首页
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <Trophy className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">灵审云评 <span className="text-cyan-400">/</span> 工作站</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/history')} className="text-slate-400 hover:text-cyan-400">
            <History className="w-4 h-4 mr-2" /> 历史记录
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="mb-16">
          <div className="flex items-center gap-2 mb-4"><div className="h-px w-8 bg-cyan-500" /><span className="text-xs font-bold tracking-widest text-cyan-500 uppercase">提交流程</span></div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">开启智能评审任务</h1>
          <p className="text-slate-400 max-w-xl">请按照流程指引选择对应的竞赛赛道并提交您的作品。支持单文件、多文件或 ZIP 压缩包上传，系统将自动调用 AI 工作流进行评审。</p>
        </div>

        <div className="grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-3">
            <nav className="space-y-8 relative">
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-slate-800" />
              {steps.map((step, idx) => {
                const isActive = (idx === 0 && !selectedContestId) || (idx === 1 && selectedContestId && !selectedTrackId) || (idx === 2 && selectedTrackId && !isReadyToSubmit);
                const isCompleted = (idx === 0 && selectedContestId) || (idx === 1 && selectedTrackId) || (idx === 2 && isReadyToSubmit);
                return (
                  <div key={step.num} className="relative flex items-start gap-6 group">
                    <div className={cn("relative z-10 w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all duration-500", isCompleted ? "bg-cyan-500 border-cyan-500" : isActive ? "border-cyan-500 bg-slate-900 shadow-[0_0_15px_rgba(6,182,212,0.3)]" : "border-slate-800 bg-slate-950")}>
                      {isCompleted ? <Check className="w-5 h-5 text-slate-950" /> : <span className={cn("text-sm font-mono font-bold", isActive ? "text-cyan-400" : "text-slate-600")}>{step.num}</span>}
                    </div>
                    <div>
                      <h4 className={cn("text-sm font-bold tracking-wide transition-colors", isActive || isCompleted ? "text-white" : "text-slate-500")}>{step.title}</h4>
                      <p className="text-[10px] font-mono text-slate-600 mt-1 uppercase tracking-widest">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="lg:col-span-9 space-y-6">
            <Card className={cn("bg-slate-900/40 border-slate-800 backdrop-blur-sm transition-all", selectedContestId && "border-cyan-500/30 bg-cyan-500/5")}>
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-8"><div className="p-2 rounded-md bg-slate-800 text-slate-400"><Sparkles className="w-4 h-4" /></div><h3 className="text-lg font-semibold text-white">选择目标竞赛</h3></div>
                {loadingContests ? <div className="flex flex-col items-center py-12"><div className="w-8 h-8 border-2 border-t-cyan-500 rounded-full animate-spin mb-4" /></div> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contests.map((c) => (
                      <button key={c.id} onClick={() => setContestId(c.id)} className={cn("group p-5 rounded-xl border transition-all text-left flex items-center justify-between", selectedContestId === c.id ? "border-cyan-500 bg-cyan-500/10" : "border-slate-800 bg-slate-950/50 hover:border-slate-600")}>
                        <div className="flex items-center gap-4">
                          <ContestLogo url={c.logo_url} name={c.name} id={c.id} size="md" />
                          <div><p className={cn("font-bold", selectedContestId === c.id ? "text-white" : "text-slate-300")}>{c.name}</p><p className="text-[10px] text-slate-500 uppercase">{c.tracks?.length || 0} 个可选赛道</p></div>
                        </div>
                        {selectedContestId === c.id && <Check className="w-4 h-4 text-cyan-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={cn("bg-slate-900/40 border-slate-800 backdrop-blur-sm transition-all", !selectedContestId && "opacity-40 grayscale", selectedTrackId && "border-cyan-500/30 bg-cyan-500/5")}>
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-8"><div className="p-2 rounded-md bg-slate-800 text-slate-400"><FolderTree className="w-4 h-4" /></div><h3 className="text-lg font-semibold text-white">确认参赛赛道</h3></div>
                {!selectedContestId ? <div className="h-20 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-slate-600 text-xs italic font-mono uppercase tracking-widest">等待完成第一步...</div> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availableTracks.length === 0 ? <div className="col-span-2 text-center py-4 text-slate-500 text-sm">该竞赛暂未配置赛道，请联系管理员</div> : availableTracks.map((t) => (
                      <button key={t.id} onClick={() => setTrackId(t.id)} className={cn("p-5 rounded-xl border transition-all text-left flex items-center gap-4", selectedTrackId === t.id ? "border-cyan-500 bg-cyan-500/10" : "border-slate-800 bg-slate-950/50 hover:border-slate-600")}>
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", selectedTrackId === t.id ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-500")}><Cpu className="w-4 h-4" /></div>
                        <div><p className={cn("font-bold text-sm", selectedTrackId === t.id ? "text-white" : "text-slate-300")}>{t.name}</p></div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={cn("bg-slate-900/40 border-slate-800 backdrop-blur-sm transition-all", !selectedTrackId && "opacity-40 grayscale")}>
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3"><div className="p-2 rounded-md bg-slate-800 text-slate-400"><Layers className="w-4 h-4" /></div><h3 className="text-lg font-semibold text-white">上传参赛作品</h3></div>
                  <div className="flex gap-1 bg-slate-950/50 rounded-lg p-1 border border-slate-800">
                    <button onClick={() => { setUploadMode('single'); clearBatch(); }} disabled={!selectedTrackId} className={cn("px-3 py-1 rounded text-[10px] font-bold uppercase transition-all", uploadMode === 'single' ? "bg-cyan-500 text-slate-950" : "text-slate-500 hover:text-white")}>单文件</button>
                    <button onClick={() => { setUploadMode('multi'); clearBatch(); }} disabled={!selectedTrackId} className={cn("px-3 py-1 rounded text-[10px] font-bold uppercase transition-all", uploadMode === 'multi' ? "bg-cyan-500 text-slate-950" : "text-slate-500 hover:text-white")}>多文件</button>
                    <button onClick={() => { setUploadMode('zip'); clearBatch(); }} disabled={!selectedTrackId} className={cn("px-3 py-1 rounded text-[10px] font-bold uppercase transition-all", uploadMode === 'zip' ? "bg-cyan-500 text-slate-950" : "text-slate-500 hover:text-white")}>ZIP包</button>
                  </div>
                </div>
                {!selectedTrackId ? <div className="h-20 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-slate-600 text-xs italic font-mono uppercase tracking-widest">等待确认赛道...</div> : (
                  <>
                    <div onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFileSelect(e.dataTransfer.files); }} onClick={() => fileInputRef.current?.click()} className={cn("relative border-2 border-dashed rounded-2xl p-10 transition-all cursor-pointer text-center group", isDragOver ? "border-cyan-500 bg-cyan-500/5" : currentBatch.length > 0 ? "border-cyan-500/30 bg-cyan-500/5" : "border-slate-800 hover:border-slate-600 hover:bg-slate-900/50")}>
                      <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelect(e.target.files)} className="hidden" multiple={uploadMode === 'multi'} accept={uploadMode === 'zip' ? '.zip' : '.pdf,.doc,.docx'} />
                      <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">{uploadMode === 'zip' ? <Package className="w-6 h-6 text-slate-400" /> : <Upload className="w-6 h-6 text-slate-400" />}</div>
                      <p className="text-sm font-bold text-white uppercase tracking-wider">{uploadMode === 'zip' ? '拖拽 ZIP 压缩包到此处' : '拖拽作品文档到此处或点击上传'}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-widest">{uploadMode === 'zip' ? '支持: ZIP (最大 100MB)' : '支持: PDF, DOCX (最大 20MB)'}</p>
                    </div>
                    {currentBatch.length > 0 && (
                      <div className="mt-6 space-y-2">
                        <div className="flex items-center justify-between px-2 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]"><span>待处理队列</span><button onClick={clearBatch} className="hover:text-red-400 text-[10px]">清空队列</button></div>
                        {currentBatch.map((bf) => (
                          <div key={bf.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0"><FileText className={cn("w-4 h-4 shrink-0", bf.status === 'success' ? "text-emerald-400" : bf.status === 'error' ? "text-red-400" : "text-slate-500")} /><span className="text-xs font-medium truncate text-slate-300">{bf.filename}</span></div>
                              <div className="flex items-center gap-2">{bf.workflowRunId && <Button size="sm" variant="ghost" className="h-6 text-[9px] text-cyan-400 gap-1" onClick={() => navigate(`/result/${bf.workflowRunId}`)}>查看报告 <ExternalLink className="w-2.5 h-2.5" /></Button>}{!hasProcessing && <button onClick={() => setFiles(currentBatch.filter(f => f.id !== bf.id))} className="text-slate-600 hover:text-red-400"><X className="w-3 h-3" /></button>}</div>
                            </div>
                            {bf.status !== 'idle' && (
                              <div className="space-y-1"><div className="flex justify-between text-[8px] font-black uppercase tracking-tighter"><span className="text-primary">{bf.status === 'processing' ? 'AI 深度分析中' : bf.status === 'uploading' ? '正在上传' : '正在提交'}</span><span>{bf.progress}%</span></div><Progress value={bf.progress} className="h-0.5 bg-white/5 [&>div]:bg-primary shadow-[0_0_5px_rgba(59,130,246,0.5)]" /></div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            <div className="pt-6">
              <Button size="lg" onClick={handleSubmit} disabled={!isReadyToSubmit || hasProcessing} className={cn("w-full h-16 text-xs font-black uppercase tracking-[0.3em] transition-all rounded-xl", isReadyToSubmit ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(8,145,178,0.3)]" : "bg-slate-900 text-slate-700 cursor-not-allowed border border-slate-800")}>
                {hasProcessing ? <><Loader2 className="w-4 h-4 animate-spin mr-3" /> 正在执行评审协议...</> : <><Zap className="w-4 h-4 mr-3 fill-current" /> 立即启动智能评审</>}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-900 mt-20 text-center"><p className="text-[9px] text-slate-600 tracking-widest font-mono uppercase italic">信创安全文档处理节点 • AI 智能评审引擎 v2.4.0</p></footer>
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <Card className="max-w-md bg-slate-900 border-white/5 shadow-2xl p-8 rounded-3xl text-center"><AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-6" /><h3 className="text-xl font-black text-white uppercase tracking-tighter mb-4">测评正在进行中</h3><p className="text-slate-400 text-sm font-light mb-8">测评任务正在后台运行，此时离开可能导致进度跟踪中断。确认注销当前会话？</p><div className="flex gap-4"><Button variant="outline" className="flex-1 border-white/5 h-12 uppercase tracking-widest text-[10px] font-black" onClick={() => blocker.reset?.()}>留在页面</Button><Button variant="destructive" className="flex-1 h-12 uppercase tracking-widest text-[10px] font-black" onClick={() => blocker.proceed?.()}>确认离开</Button></div></Card>
        </div>
      )}
    </div>
  );
}
