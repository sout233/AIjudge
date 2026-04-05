import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  LogOut
} from 'lucide-react';
import { authApi } from '@/api/auth';
import { adminApi } from '@/api/admin';
import { judgeApi } from '@/api/judge';
import { useHistoryStore } from '@/stores/historyStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface UploadingFile {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  serverFilename?: string;
  error?: string;
}

type UploadMode = 'single' | 'multi' | 'zip';

export function SubmitWorkPage() {
  const navigate = useNavigate();
  const { addRecord } = useHistoryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: contests = [], isLoading: loadingContests } = useQuery({
    queryKey: ['contests'],
    queryFn: adminApi.getContests,
  });

  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<UploadMode>('single');
  
  // 单文件模式
  const [singleFile, setSingleFile] = useState<File | null>(null);
  
  // 批量模式
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  
  // ZIP 模式
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipUploading, setZipUploading] = useState(false);
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 路由拦截器：防止提交过程中刷新页面
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (submitting) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [submitting]);

  const selectedContest = useMemo(() => {
    return contests.find((c) => c.id === selectedContestId);
  }, [contests, selectedContestId]);

  const availableTracks = useMemo(() => {
    return selectedContest?.tracks || [];
  }, [selectedContest]);

  const handleSelectContest = (contestId: string) => {
    setSelectedContestId(contestId);
    setSelectedTrackId(null);
    setSingleFile(null);
    setUploadingFiles([]);
    setZipFile(null);
  };

  // 单文件提交
  const startSingleJudge = async () => {
    if (!singleFile || !selectedContestId || !selectedTrackId) return;
    setSubmitting(true);
    try {
      const uploadRes = await judgeApi.uploadFile(singleFile);
      if (!uploadRes?.filename) throw new Error('上传失败');
      const judgeRes = await judgeApi.submitJudge(selectedContestId, uploadRes.filename, selectedTrackId);
      const contest = contests.find((c) => c.id === selectedContestId);
      const track = availableTracks.find((t) => t.id === selectedTrackId);
      addRecord({
        id: judgeRes.workflow_run_id,
        filename: singleFile.name,
        contestName: contest ? `${contest.name} - ${track?.name || '未知赛道'}` : '未知竞赛',
        time: new Date().toLocaleTimeString(),
      });
      navigate(`/result/${judgeRes.workflow_run_id}`);
    } catch (e: unknown) {
      const error = e as { response?: { data?: { detail?: string } }; message?: string };
      alert(error.response?.data?.detail || error.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 批量提交（多文件）
  const startBatchJudge = async () => {
    const readyFiles = uploadingFiles.filter(f => f.status === 'success' && f.serverFilename);
    if (readyFiles.length === 0 || !selectedContestId || !selectedTrackId) {
      alert('请至少上传一个文件');
      return;
    }
    
    setSubmitting(true);
    try {
      const filenames = readyFiles.map(f => f.serverFilename!);
      const response = await judgeApi.submitBatchJudge(selectedContestId, filenames, selectedTrackId);
      
      const contest = contests.find((c) => c.id === selectedContestId);
      const track = availableTracks.find((t) => t.id === selectedTrackId);
      
      // 为每个结果添加历史记录
      response.tasks.forEach((res, index) => {
        const originalFile = readyFiles[index];
        if (originalFile) {
          addRecord({
            id: res.workflow_run_id,
            filename: originalFile.file.name,
            contestName: contest ? `${contest.name} - ${track?.name || '未知赛道'}` : '未知竞赛',
            time: new Date().toLocaleTimeString(),
          });
        }
      });
      
      // 跳转到批量结果页面
      const workflowIds = response.tasks.map(r => r.workflow_run_id).join(',');
      navigate(`/batch-result/${workflowIds}`);
    } catch (e: unknown) {
      const error = e as { response?: { data?: { detail?: string } }; message?: string };
      alert(error.response?.data?.detail || error.message || '批量提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ZIP 批量提交
  const startZipBatchJudge = async () => {
    if (!zipFile || !selectedContestId || !selectedTrackId) {
      alert('请上传 ZIP 文件');
      return;
    }
    
    setSubmitting(true);
    try {
      // 上传 ZIP 文件
      setZipUploading(true);
      const uploadRes = await judgeApi.uploadFile(zipFile);
      setZipUploading(false);
      
      if (!uploadRes?.filename) throw new Error('ZIP 上传失败');
      
      // 提交 ZIP 批量评分
      const result = await judgeApi.submitZipBatchJudge(selectedContestId, uploadRes.filename, selectedTrackId);
      
      // 跳转到 ZIP 批量结果页面
      navigate(`/zip-batch-result/${result.manifest_id}`);
    } catch (e: unknown) {
      const error = e as { response?: { data?: { detail?: string } }; message?: string };
      alert(error.response?.data?.detail || error.message || 'ZIP 批量提交失败');
    } finally {
      setSubmitting(false);
      setZipUploading(false);
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    if (uploadMode === 'zip') {
      // ZIP 模式：只取第一个 zip 文件
      const file = files[0];
      if (!file.name.toLowerCase().endsWith('.zip')) {
        alert('请上传 ZIP 格式的压缩文件');
        return;
      }
      setZipFile(file);
    } else if (uploadMode === 'multi') {
      // 批量模式：添加文件到列表并上传
      const newFiles: UploadingFile[] = Array.from(files).map(file => ({
        file,
        status: 'pending' as const
      }));
      
      setUploadingFiles(prev => [...prev, ...newFiles]);
      
      // 逐个上传文件
      for (let i = 0; i < newFiles.length; i++) {
        const uploadingFile = newFiles[i];
        setUploadingFiles(prev => prev.map(f => 
          f.file === uploadingFile.file ? { ...f, status: 'uploading' } : f
        ));
        
        try {
          const res = await judgeApi.uploadFile(uploadingFile.file);
          setUploadingFiles(prev => prev.map(f => 
            f.file === uploadingFile.file 
              ? { ...f, status: 'success', serverFilename: res.filename } 
              : f
          ));
        } catch (error) {
          setUploadingFiles(prev => prev.map(f => 
            f.file === uploadingFile.file 
              ? { ...f, status: 'error', error: '上传失败' } 
              : f
          ));
        }
      }
    } else {
      // 单文件模式
      setSingleFile(files[0]);
    }
  };

  const removeFile = (fileToRemove: File) => {
    if (uploadMode === 'zip') {
      setZipFile(null);
    } else if (uploadMode === 'multi') {
      setUploadingFiles(prev => prev.filter(f => f.file !== fileToRemove));
    } else {
      setSingleFile(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (selectedContestId && selectedTrackId) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (selectedContestId && selectedTrackId && e.dataTransfer.files?.length) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const steps = [
    { num: '01', title: '选择竞赛', desc: 'SELECT CONTEST' },
    { num: '02', title: '确认赛道', desc: 'CONFIRM TRACK' },
    { num: '03', title: '上传作品', desc: 'UPLOAD WORK' },
  ];

  const getReadyStatus = () => {
    switch (uploadMode) {
      case 'single':
        return singleFile && selectedTrackId;
      case 'multi':
        return uploadingFiles.filter(f => f.status === 'success').length > 0 && selectedTrackId;
      case 'zip':
        return zipFile && selectedTrackId;
      default:
        return false;
    }
  };

  const isReadyToSubmit = getReadyStatus();

  const getSubmitButtonText = () => {
    if (submitting) {
      if (zipUploading) return '正在上传 ZIP 文件...';
      return uploadMode === 'zip' ? '正在解析 ZIP 并创建批量任务...' : '正在初始化评审工作流...';
    }
    switch (uploadMode) {
      case 'single':
        return '提交评审任务';
      case 'multi':
        return `批量提交 (${uploadingFiles.filter(f => f.status === 'success').length} 个文件)`;
      case 'zip':
        return '上传 ZIP 并批量评审';
      default:
        return '提交评审任务';
    }
  };

  const handleSubmit = () => {
    switch (uploadMode) {
      case 'single':
        return startSingleJudge();
      case 'multi':
        return startBatchJudge();
      case 'zip':
        return startZipBatchJudge();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 relative overflow-hidden font-sans">
      {/* 继承自 Landing Page 的背景装饰 */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/10 via-slate-900 to-purple-900/10" />
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      {/* Header - 保持与首页一致的简洁透明感 */}
      <header className="relative z-50 border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')} 
            className="text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <Trophy className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              灵审云评 <span className="text-cyan-400">/</span> 工作站
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/history')} 
              className="text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <History className="w-4 h-4 mr-2" />
              历史记录
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => authApi.logout()} 
              className="text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-2" />
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        {/* 页面标题区 */}
        <div className="mb-16">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px w-8 bg-cyan-500" />
            <span className="text-xs font-bold tracking-widest text-cyan-500 uppercase">Submission Process</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
            开启智能评审任务
          </h1>
          <p className="text-slate-400 max-w-xl">
            请按照流程指引选择对应的竞赛赛道并提交您的作品。支持单文件、多文件批量或 ZIP 压缩包上传，系统将自动调用 Dify 工作流进行多维度评估。
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-12">
          {/* 左侧：专业化进度指示器 */}
          <div className="lg:col-span-3">
            <nav className="space-y-8 relative">
              {/* 贯穿线 */}
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-slate-800" />
              
              {steps.map((step, idx) => {
                const isActive = (idx === 0 && !selectedContestId) ||
                  (idx === 1 && selectedContestId && !selectedTrackId) ||
                  (idx === 2 && selectedTrackId && !isReadyToSubmit);
                const isCompleted = (idx === 0 && selectedContestId) ||
                  (idx === 1 && selectedTrackId) ||
                  (idx === 2 && isReadyToSubmit);

                return (
                  <div key={step.num} className="relative flex items-start gap-6 group">
                    <div className={cn(
                      "relative z-10 w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all duration-500",
                      isCompleted ? "bg-cyan-500 border-cyan-500" : 
                      isActive ? "border-cyan-500 bg-slate-900 shadow-[0_0_15px_rgba(6,182,212,0.3)]" : 
                      "border-slate-800 bg-slate-950"
                    )}>
                      {isCompleted ? (
                        <Check className="w-5 h-5 text-slate-950" />
                      ) : (
                        <span className={cn(
                          "text-sm font-mono font-bold",
                          isActive ? "text-cyan-400" : "text-slate-600"
                        )}>{step.num}</span>
                      )}
                    </div>
                    <div>
                      <h4 className={cn(
                        "text-sm font-bold tracking-wide transition-colors",
                        isActive || isCompleted ? "text-white" : "text-slate-500"
                      )}>{step.title}</h4>
                      <p className="text-[10px] font-mono text-slate-600 mt-1 uppercase tracking-widest">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>

          {/* 右侧：操作区 */}
          <div className="lg:col-span-9 space-y-6">
            {/* Step 1: 竞赛选择 */}
            <Card className={cn(
              "bg-slate-900/40 border-slate-800 backdrop-blur-sm transition-all duration-500",
              selectedContestId && "border-cyan-500/30 bg-cyan-500/5"
            )}>
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 rounded-md bg-slate-800 text-slate-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">选择目标竞赛</h3>
                </div>

                {loadingContests ? (
                  <div className="flex flex-col items-center py-12">
                    <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
                    <p className="text-slate-500 text-sm font-mono">FETCHING_DATA...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contests.filter((contest) => contest.is_published).map((contest) => (
                      <button
                        key={contest.id}
                        onClick={() => handleSelectContest(contest.id)}
                        className={cn(
                          "group relative p-5 rounded-xl border transition-all text-left",
                          selectedContestId === contest.id
                            ? "border-cyan-500 bg-cyan-500/10"
                            : "border-slate-800 bg-slate-950/50 hover:border-slate-600"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl transition-all overflow-hidden",
                            selectedContestId === contest.id ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-500"
                          )}>
                            {contest.logo ? (
                              <img 
                                src={contest.logo} 
                                alt={contest.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              contest.name.charAt(0)
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={cn(
                              "font-bold transition-colors",
                              selectedContestId === contest.id ? "text-white" : "text-slate-300"
                            )}>{contest.name}</p>
                            <p className="text-xs text-slate-500 mt-1 uppercase tracking-tighter">
                              {contest.tracks?.length || 0} Available Tracks
                            </p>
                          </div>
                          {selectedContestId === contest.id && <Check className="w-5 h-5 text-cyan-400" />}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: 赛道选择 */}
            <Card className={cn(
              "bg-slate-900/40 border-slate-800 backdrop-blur-sm transition-all duration-500",
              !selectedContestId && "opacity-40 grayscale",
              selectedTrackId && "border-cyan-500/30 bg-cyan-500/5"
            )}>
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 rounded-md bg-slate-800 text-slate-400">
                    <FolderTree className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">确认参赛赛道</h3>
                </div>

                {!selectedContestId ? (
                  <div className="h-24 flex items-center justify-center border border-dashed border-slate-800 rounded-xl">
                    <p className="text-slate-600 text-sm">请先完成上一步选择</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availableTracks.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => setSelectedTrackId(track.id)}
                        className={cn(
                          "group p-5 rounded-xl border transition-all text-left",
                          selectedTrackId === track.id
                            ? "border-cyan-500 bg-cyan-500/10"
                            : "border-slate-800 bg-slate-950/50 hover:border-slate-600"
                        )}
                      >
                        <div className="flex items-start gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                            selectedTrackId === track.id ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-500"
                          )}>
                            <Cpu className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className={cn(
                              "font-bold transition-colors",
                              selectedTrackId === track.id ? "text-white" : "text-slate-300"
                            )}>{track.name}</p>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{track.description || '无赛道描述'}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 3: 上传文档 */}
            <Card className={cn(
              "bg-slate-900/40 border-slate-800 backdrop-blur-sm transition-all duration-500",
              !selectedTrackId && "opacity-40 grayscale",
              (singleFile || uploadingFiles.length > 0 || zipFile) && "border-cyan-500/30 bg-cyan-500/5"
            )}>
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-slate-800 text-slate-400">
                      {uploadMode === 'zip' ? <FileArchive className="w-4 h-4" /> : 
                       uploadMode === 'multi' ? <Layers className="w-4 h-4" /> : 
                       <FileText className="w-4 h-4" />}
                    </div>
                    <h3 className="text-lg font-semibold text-white">
                      {uploadMode === 'zip' ? '上传 ZIP 压缩包' : 
                       uploadMode === 'multi' ? '批量上传参赛作品' : 
                       '上传参赛作品文档'}
                    </h3>
                  </div>
                  
                  {/* 模式切换 */}
                  <div className="flex items-center gap-2 bg-slate-950/50 rounded-lg p-1 border border-slate-800">
                    <button
                      onClick={() => {
                        setUploadMode('single');
                        setUploadingFiles([]);
                        setZipFile(null);
                      }}
                      disabled={!selectedTrackId}
                      className={cn(
                        "px-3 py-1.5 rounded text-sm font-medium transition-all",
                        uploadMode === 'single' 
                          ? "bg-cyan-500 text-slate-950" 
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      单文件
                    </button>
                    <button
                      onClick={() => {
                        setUploadMode('multi');
                        setSingleFile(null);
                        setZipFile(null);
                      }}
                      disabled={!selectedTrackId}
                      className={cn(
                        "px-3 py-1.5 rounded text-sm font-medium transition-all",
                        uploadMode === 'multi' 
                          ? "bg-cyan-500 text-slate-950" 
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      多文件
                    </button>
                    <button
                      onClick={() => {
                        setUploadMode('zip');
                        setSingleFile(null);
                        setUploadingFiles([]);
                      }}
                      disabled={!selectedTrackId}
                      className={cn(
                        "px-3 py-1.5 rounded text-sm font-medium transition-all",
                        uploadMode === 'zip' 
                          ? "bg-cyan-500 text-slate-950" 
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      ZIP
                    </button>
                  </div>
                </div>

                {!selectedTrackId ? (
                  <div className="h-24 flex items-center justify-center border border-dashed border-slate-800 rounded-xl">
                    <p className="text-slate-600 text-sm">请先确认参赛赛道</p>
                  </div>
                ) : (
                  <>
                    {/* 上传区域 */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "relative border-2 border-dashed rounded-2xl p-12 transition-all cursor-pointer mb-6",
                        isDragOver ? "border-cyan-500 bg-cyan-500/5 scale-[0.99]" : 
                        (singleFile || uploadingFiles.length > 0 || zipFile) ? "border-cyan-500/50 bg-cyan-500/5" : 
                        "border-slate-800 hover:border-slate-600 hover:bg-slate-900/50"
                      )}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => handleFileSelect(e.target.files)}
                        className="hidden"
                        accept={uploadMode === 'zip' ? '.zip' : '.pdf,.doc,.docx'}
                        multiple={uploadMode === 'multi'}
                      />

                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-slate-800 flex items-center justify-center">
                          {uploadMode === 'zip' ? <Package className="w-8 h-8 text-slate-400" /> : 
                           uploadMode === 'multi' ? <Layers className="w-8 h-8 text-slate-400" /> : 
                           <Upload className="w-8 h-8 text-slate-400" />}
                        </div>
                        <p className="text-white font-medium mb-1 tracking-wide">
                          {uploadMode === 'zip' ? '拖拽 ZIP 文件到此处或点击上传' : 
                           uploadMode === 'multi' ? '拖拽多个文件到此处或点击批量上传' : 
                           '拖拽文件到此处或点击上传'}
                        </p>
                        <p className="text-xs text-slate-500 font-mono uppercase tracking-widest">
                          {uploadMode === 'zip' ? 'Support: ZIP (MAX 100MB)' : 
                           uploadMode === 'multi' ? 'Support: PDF, DOCX(MAX 20MB each) • 支持多选' : 
                           'Support: PDF, DOCX(MAX 20MB)'}
                        </p>
                        {uploadMode === 'zip' && (
                          <p className="text-xs text-cyan-500/70 mt-2">
                            ZIP 文件将自动解压，最多并发处理 3 个文件
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 单文件模式：显示已选文件 */}
                    {uploadMode === 'single' && singleFile && (
                      <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-cyan-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white max-w-[300px] truncate">{singleFile.name}</p>
                            <p className="text-[10px] font-mono text-slate-500">{(singleFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(singleFile);
                          }}
                          className="text-slate-500 hover:text-red-400 hover:bg-red-400/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    {/* 批量模式：文件列表 */}
                    {uploadMode === 'multi' && uploadingFiles.length > 0 && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-slate-400">
                            已选择 {uploadingFiles.length} 个文件
                            {uploadingFiles.filter(f => f.status === 'success').length > 0 && (
                              <Badge variant="outline" className="ml-2 text-cyan-400 border-cyan-400/30">
                                {uploadingFiles.filter(f => f.status === 'success').length} 个已就绪
                              </Badge>
                            )}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadingFiles([]);
                            }}
                            className="text-slate-500 hover:text-red-400 hover:bg-red-400/10"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            清空全部
                          </Button>
                        </div>
                        
                        {uploadingFiles.map((uploadingFile, index) => (
                          <div 
                            key={index} 
                            className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                                uploadingFile.status === 'success' ? "bg-green-500/20" :
                                uploadingFile.status === 'error' ? "bg-red-500/20" :
                                uploadingFile.status === 'uploading' ? "bg-cyan-500/20" :
                                "bg-slate-800"
                              )}>
                                {uploadingFile.status === 'success' ? (
                                  <Check className="w-5 h-5 text-green-400" />
                                ) : uploadingFile.status === 'error' ? (
                                  <AlertCircle className="w-5 h-5 text-red-400" />
                                ) : uploadingFile.status === 'uploading' ? (
                                  <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                                ) : (
                                  <File className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{uploadingFile.file.name}</p>
                                <p className="text-[10px] font-mono text-slate-500">
                                  {(uploadingFile.file.size / 1024 / 1024).toFixed(2)} MB
                                  {uploadingFile.status === 'uploading' && ' • 上传中...'}
                                  {uploadingFile.status === 'error' && ` • ${uploadingFile.error}`}
                                  {uploadingFile.status === 'success' && ' • 已就绪'}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(uploadingFile.file);
                              }}
                              disabled={uploadingFile.status === 'uploading'}
                              className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 flex-shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ZIP 模式：显示已选 ZIP 文件 */}
                    {uploadMode === 'zip' && zipFile && (
                      <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <FileArchive className="w-6 h-6 text-purple-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white max-w-[300px] truncate">{zipFile.name}</p>
                            <p className="text-[10px] font-mono text-slate-500">{(zipFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(zipFile);
                          }}
                          className="text-slate-500 hover:text-red-400 hover:bg-red-400/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* 提交动作 */}
            <div className="pt-6">
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={!isReadyToSubmit || submitting}
                className={cn(
                  "w-full h-16 text-lg font-bold transition-all duration-300 rounded-xl",
                  isReadyToSubmit
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(8,145,178,0.3)]"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                )}
              >
                {submitting ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>{getSubmitButtonText()}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {getSubmitButtonText()}
                    <ChevronRight className="w-5 h-5" />
                  </div>
                )}
              </Button>
              <p className="text-center text-[10px] text-slate-600 mt-4 font-mono uppercase tracking-[0.2em]">
                Secure Document Processing • Private Dify Node • Encrypted Transmission
                {uploadMode === 'zip' && ' • Max Concurrent: 3'}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* 页脚版权信息同步首页风格 */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-900 mt-20 text-center">
        <p className="text-[9px] text-slate-600 tracking-widest font-mono uppercase">
          鄂ICP备2026012182号-1 • AI Judging Engine v2.0
        </p>
      </footer>
    </div>
  );
}
