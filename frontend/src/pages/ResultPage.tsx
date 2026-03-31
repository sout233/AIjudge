import { useRef, useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Download,
  FileText,
  AlertTriangle,
  XCircle,
  Loader2,
  Users,
  User,
  BarChart3,
  LayoutDashboard,
  CheckCircle2,
  ArrowLeft,
  Cpu,
  Sparkles,
  ExternalLink,
  Target,
  Trophy
} from 'lucide-react';
import { useJudgePolling } from '@/hooks/useJudgePolling';
import { judgeApi } from '@/api/judge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { SingleEvaluation, JudgeDimension, JudgePoint } from '@/types';

export function ResultPage() {
  const { workflowRunId } = useParams<{ workflowRunId: string }>();
  const navigate = useNavigate();
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");

  const { status, statusText, progressText, result, isLoading } = useJudgePolling(workflowRunId);

  useEffect(() => {
    if (scrollBoxRef.current) {
      scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight;
    }
  }, [progressText]);

  const getStatusBadgeClass = () => {
    switch (status) {
      case 'running': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'succeeded':
      case 'success': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'error':
      case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const downloadPdf = async () => {
    if (!workflowRunId) return;
    setDownloading(true);
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
    } finally {
      setDownloading(false);
    }
  };

  const averageScore = useMemo(() => {
    if (!result?.evaluations?.length) return 0;
    const total = result.evaluations.reduce((acc, curr) => acc + curr.total_score, 0);
    return Math.round(total / result.evaluations.length);
  }, [result]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-slate-200 relative overflow-hidden px-4 pb-20">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

      <div className="max-w-6xl mx-auto space-y-8 pt-8 relative z-10">
        {/* Header Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-white hover:bg-white/10 backdrop-blur-md border border-white/5"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回列表
          </Button>
        </div>

        {/* Main Report Header */}
        <Card className="bg-slate-900/40 backdrop-blur-2xl border-white/10 shadow-2xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
          <CardHeader className="relative z-10 p-8 pb-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/50 flex items-center justify-center text-primary shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                    <Trophy className="w-6 h-6 stroke-blue-50" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight italic uppercase">
                        {result?.project_name || "测评详情报告"}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-[12px] font-mono text-slate-500 uppercase tracking-widest">ID: {workflowRunId?.slice(0, 12)}...</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Badge className={cn("h-8 px-4 rounded-full font-bold uppercase tracking-widest text-[12px] border", getStatusBadgeClass())}>
                  {status === 'running' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  {statusText}
                </Badge>

                {result && (
                  <Button
                    onClick={downloadPdf}
                    disabled={downloading}
                    className="h-10 px-6 bg-primary hover:bg-blue-400 text-white font-black uppercase tracking-widest text-[12px] shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                  >
                    {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    导出PDF
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Processing Logs */}
        {(status !== 'succeeded' && status !== 'success') && (
            <Card className="bg-black/60 backdrop-blur-xl border-white/5 shadow-2xl overflow-hidden font-mono">
                <div className="bg-white/5 px-4 py-2 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[12px] text-slate-500 uppercase tracking-[0.2em]">输出</span>
                    <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-red-500/40" />
                        <div className="w-2 h-2 rounded-full bg-amber-500/40" />
                        <div className="w-2 h-2 rounded-full bg-emerald-500/40" />
                    </div>
                </div>
                <div className="h-40 overflow-y-auto p-6 text-sm text-primary/80 leading-relaxed custom-scrollbar" ref={scrollBoxRef}>
                    {!progressText ? (
                        <div className="flex items-center gap-3 animate-pulse">
                            <Loader2 className="w-4 h-4 animate-spin stroke-white" />
                            <span className="uppercase tracking-widest text-xs text-white">正在评分...</span>
                        </div>
                    ) : (
                        <pre className="whitespace-pre-wrap">{progressText}</pre>
                    )}
                </div>
            </Card>
        )}

        {/* Content Tabs */}
        {result ? (
          <Tabs defaultValue="summary" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700" onValueChange={setActiveTab}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <TabsList className="bg-slate-900/50 backdrop-blur-md border border-white/10 p-1 h-12 rounded-2xl">
                <TabsTrigger value="summary" className="rounded-xl px-6 h-full data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase tracking-widest text-[12px] transition-all">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  综合概览
                </TabsTrigger>
                {result.evaluations.map((ev: SingleEvaluation) => (
                  <TabsTrigger key={ev.judge_tag} value={ev.judge_tag} className="rounded-xl px-6 h-full data-[state=active]:bg-primary data-[state=active]:text-white font-bold uppercase tracking-widest text-[12px] transition-all">
                    <User className="w-4 h-4 mr-2" />
                    专家 {ev.judge_tag}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/5 backdrop-blur-sm text-[12px] font-mono text-slate-500 uppercase tracking-widest font-bold">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <p className='font-bold'>综合测评已完成</p>
              </div>
            </div>

            {/* Summary View */}
            <TabsContent value="summary" className="space-y-8 outline-none">
              <div className="grid md:grid-cols-4 gap-6">
                {/* Score Card */}
                <Card className="md:col-span-1 bg-slate-900/40 backdrop-blur-xl border-white/10 shadow-2xl overflow-hidden relative group">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-transparent opacity-50" />
                  <CardHeader className="text-center pb-2 relative z-10">
                    <CardTitle className="text-[12px] font-black uppercase tracking-[0.3em] text-primary/80 text-white">核心平均分</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center pb-10 relative z-10">
                    <div className="text-8xl font-black text-white tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                      {averageScore}
                    </div>
                    <div className="mt-8 py-2 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[12px] font-black uppercase tracking-widest inline-flex items-center gap-2">
                        <Sparkles className="w-3 h-3" />
                        已量化结果
                    </div>
                  </CardContent>
                </Card>

                {/* Judge Quick Cards */}
                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {result.evaluations.map((ev: SingleEvaluation) => (
                    <Card
                        key={ev.judge_tag}
                        className="bg-slate-900/30 backdrop-blur-md border-white/5 hover:border-primary/50 transition-all duration-500 group cursor-pointer relative overflow-hidden"
                        onClick={() => setActiveTab(ev.judge_tag)}
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-center mb-2 text-white">
                          <span className="text-xl font-black text-primary uppercase tracking-[0.2em] text-white">测评 {ev.judge_tag}</span>
                          <span className="text-2xl font-black text-white group-hover:text-primary transition-colors">{ev.total_score}</span>
                        </div>
                        <CardTitle className="text-sm font-bold text-slate-300">{ev.judge_style}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-slate-200 leading-relaxed italic line-clamp-4">
                          "{ev.overall_comment}"
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Consensus Summary */}
              <Card className="bg-slate-900/40 backdrop-blur-xl border-white/10 shadow-2xl">
                  <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-3 text-white uppercase tracking-tighter">
                          <Users className="w-5 h-5 text-primary" />
                          多维专家共识报告摘要
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="grid md:grid-cols-3 gap-8 pt-4">
                      {result.evaluations.map((ev: SingleEvaluation) => (
                          <div key={ev.judge_tag} className="space-y-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                              <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-black text-primary">
                                      {ev.judge_tag}
                                  </div>
                                  <div>
                                    <span className="text-[12px] font-black text-white uppercase tracking-widest block">{ev.judge_style}</span>
                                  </div>
                              </div>
                              <p className="text-[12px] text-slate-400 leading-relaxed text-justify">
                                  {ev.overall_comment}
                              </p>
                          </div>
                      ))}
                  </CardContent>
              </Card>
            </TabsContent>

            {/* Expert Detail View */}
            {result.evaluations.map((ev: SingleEvaluation) => (
              <TabsContent key={ev.judge_tag} value={ev.judge_tag} className="space-y-8 outline-none">
                <div className="grid md:grid-cols-4 gap-6">
                  <Card className="md:col-span-1 bg-slate-900/60 backdrop-blur-xl border-white/10">
                      <CardContent className="pt-8 text-center space-y-4">
                          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mx-auto border border-primary/30 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                              <User className="w-10 h-10 stroke-white" />
                          </div>
                          <div>
                              <h3 className="text-xl font-black text-white uppercase tracking-tighter">专家 {ev.judge_tag}</h3>
                              <p className="text-[12px] text-white/90 font-bold font-mono mt-1 tracking-[0.2em]">{ev.judge_style}</p>
                          </div>
                          <div className="pt-2 border-t border-white/5">
                              <div className="text-5xl font-black text-white tracking-tighter">{ev.total_score}</div>
                              <div className="text-[9px] text-slate-500 font-mono mt-2 uppercase tracking-[0.3em]">个人分数</div>
                          </div>
                      </CardContent>
                  </Card>
                  <Card className="md:col-span-3 bg-slate-900/30 backdrop-blur-xl border-white/5 flex flex-col justify-center">
                      <CardHeader>
                          <CardTitle className="text-[12px] font-black text-slate-500 uppercase tracking-[0.4em]">评价总结</CardTitle>
                      </CardHeader>
                      <CardContent>
                          <p className="text-xl md:text-2xl text-slate-300 leading-snug font-normal italic opacity-90">
                              "{ev.overall_comment}"
                          </p>
                      </CardContent>
                  </Card>
                </div>

                <div className="space-y-8">
                  {ev.dimensions.map((dim: JudgeDimension) => (
                    <DimensionCard key={dim.dimension_name} dimension={dim} />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : isLoading ? (
          <div className="py-40 text-center">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-primary/30 blur-[60px] rounded-full animate-pulse" />
              <Loader2 className="h-16 w-16 animate-spin text-primary relative" />
            </div>
            <p className="text-slate-400 mt-10 font-mono tracking-[0.5em] uppercase text-xs animate-pulse">正在测评中...</p>
          </div>
        ) : (status === 'error' || status === 'failed') ? (
          <div className="py-20">
            <Alert variant="destructive" className="max-w-2xl mx-auto bg-red-950/40 backdrop-blur-xl border-red-500/30 text-red-200 shadow-2xl p-8 rounded-3xl">
              <XCircle className="h-8 w-8 mb-4" />
              <AlertTitle className="text-2xl font-black mb-4 uppercase tracking-tighter">System Engine Interrupted</AlertTitle>
              <AlertDescription className="text-sm opacity-80 leading-relaxed font-normal">
                分析引擎在处理回传数据时遇到了不可恢复的致命冲突。这通常由非标文档格式、严重的数据损坏或AI核心节点负载过高导致。
                请检查控制台获取详细错误代码，并尝试重新提交。
              </AlertDescription>
              <Button onClick={() => navigate('/judge')} className="mt-8 bg-red-600 hover:bg-red-500 text-white font-bold px-8">返回</Button>
            </Alert>RETRY_SUBMISSION
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DimensionCard({ dimension }: { dimension: JudgeDimension }) {
  return (
    <Card className="bg-slate-900/40 backdrop-blur-xl border-white/10 overflow-hidden group">
      <CardHeader className="pb-8 bg-white/5 border-b border-white/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center text-primary group-hover:rotate-6 transition-transform">
                <Target className="w-6 h-6 stroke-blue-50" />
            </div>
            <div>
                <CardTitle className="text-xl text-white font-black tracking-tight">{dimension.dimension_name}</CardTitle>
                <div className="flex items-center gap-3 mt-1.5">
                    <Badge variant="outline" className=" text-white">
                        权重 {(dimension.dimension_weight * 100).toFixed(0)}%
                    </Badge>
                </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black text-white leading-none tracking-tighter">
              {dimension.dimension_score}
              <span className="text-sm font-normal text-slate-500 ml-2 tracking-normal">/ {dimension.dimension_max_score}</span>
            </div>
          </div>
        </div>
        <Progress
          value={(dimension.dimension_score / (dimension.dimension_max_score || 1)) * 100}
          className="h-1 mt-12 bg-white/20 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
        />
      </CardHeader>
      <CardContent className="pt-10">
        <div className="grid md:grid-cols-2 gap-12">
          {dimension.points.map((pt: JudgePoint) => (
            <PointCard key={pt.point_name} point={pt} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PointCard({ point }: { point: JudgePoint }) {
  return (
    <div className="space-y-5 group/point">
      <div className="flex justify-between items-start border-b border-white/5 pb-4">
        <div className="flex items-start gap-4">
            <span className="font-bold text-slate-200 text-sm group-hover/point:text-white transition-colors tracking-tight">
                {point.point_name}
            </span>
        </div>
        <span className="font-mono font-black text-primary text-sm tracking-tighter text-white">
          {point.score} <span className="text-slate-300 font-normal">/ {point.max_score}</span>
        </span>
      </div>

      <div className="space-y-5">
        <div className="leading-relaxed text-slate-400 text-justify font-normal">
            {point.reason}
        </div>

        {point.improve && (
            <div className="bg-amber-500/5 border-l-2 border-amber-500/40 p-5 rounded-r-2xl transition-all group-hover/point:bg-amber-500/10">
                <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500/70" />
                    <span className="font-black uppercase tracking-[0.3em] text-amber-500/70 font-mono">建议</span>
                </div>
                <p className="text-amber-200/60 leading-relaxed italic font-normal">
                    {point.improve}
                </p>
            </div>
        )}
      </div>
    </div>
  );
}
