import { useState, useRef} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Upload, Check, AlertCircle, Loader2, ArrowLeft, FileText } from 'lucide-react';
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

  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const startJudge = async () => {
    if (!file || !selectedContestId) return;
    setSubmitting(true);
    try {
      const uploadRes = await judgeApi.uploadFile(file);
      if (!uploadRes?.filename) throw new Error('上传失败');

      const judgeRes = await judgeApi.submitJudge(selectedContestId, uploadRes.filename);
      if (!judgeRes?.workflow_run_id) throw new Error('提交任务失败');

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

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/')}
          className="hover:bg-accent group"
        >
          <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
          返回首页
        </Button>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          创建评分任务
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          只需简单两步，AI 即可深度解析您的竞赛方案并提供权威反馈。
        </p>
      </div>

      {/* Step 1: Contest Selection */}
      <Card className="border-none shadow-sm ring-1 ring-border/60">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">1</span>
            选择竞赛类型
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingContests ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {contests.map((contest: Contest) => (
                <div
                  key={contest.id}
                  onClick={() => setSelectedContestId(contest.id)}
                  className={cn(
                    "relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:shadow-md",
                    selectedContestId === contest.id
                      ? "border-primary bg-primary/5 shadow-inner"
                      : "border-muted bg-card hover:border-primary/40"
                  )}
                >
                  <div className={cn(
                    "text-sm font-semibold text-center",
                    selectedContestId === contest.id ? 'text-primary' : 'text-foreground'
                  )}>
                    {contest.name}
                  </div>
                  {selectedContestId === contest.id && (
                    <div className="absolute -top-2 -right-2 bg-primary text-white rounded-full p-1 shadow-lg">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: File Upload */}
      <Card className={cn("border-none shadow-sm ring-1 ring-border/60 transition-opacity duration-300", !selectedContestId && "opacity-60")}>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">2</span>
            上传竞赛文档
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-10 text-center transition-all relative group",
              isDragOver ? "border-primary bg-primary/10" : "border-muted-foreground/20 hover:border-primary/50",
              !selectedContestId ? "cursor-not-allowed bg-muted/50" : "cursor-pointer"
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
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-primary/5 text-primary group-hover:scale-110 transition-transform">
                  <Upload className="h-10 w-10" />
                </div>
                <div>
                  <p className="font-semibold text-lg">点击或拖拽文件</p>
                  <p className="text-sm text-muted-foreground mt-1">支持 PDF, Word, PPT (最大 20MB)</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in-95">
                <div className="p-4 rounded-full bg-green-100 text-green-600">
                  <FileText className="h-10 w-10" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-green-700">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB • 点击更换</p>
                </div>
              </div>
            )}
            
            {!selectedContestId && (
              <div className="absolute inset-0 bg-background/20 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
                <span className="bg-white/90 px-4 py-2 rounded-full text-sm font-medium shadow-sm border">请先选择竞赛类型</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col items-center gap-4 pt-4">
        <Button
          size="lg"
          className="w-full md:w-64 h-12 text-lg font-bold shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          onClick={startJudge}
          disabled={!file || !selectedContestId || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              正在解析文档...
            </>
          ) : (
            '立即开始评分'
          )}
        </Button>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> 提交即代表您同意 AI 进行文档内容分析
        </p>
      </div>
    </div>
  );
}