import { useRef, useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
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
  CheckCircle2
} from 'lucide-react';
import { useJudgePolling } from '@/hooks/useJudgePolling';
import { judgeApi } from '@/api/judge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SingleEvaluation, JudgeDimension, JudgePoint } from '@/types';

export function ResultPage() {
  const { workflowRunId } = useParams<{ workflowRunId: string }>();
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");

  const { status, statusText, progressText, result, isLoading } = useJudgePolling(workflowRunId);

  useEffect(() => {
    if (scrollBoxRef.current) {
      scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight;
    }
  }, [progressText]);

  const getStatusBadgeVariant = () => {
    switch (status) {
      case 'running': return 'secondary';
      case 'succeeded':
      case 'success': return 'default';
      case 'error':
      case 'failed': return 'destructive';
      default: return 'outline';
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

  // 计算平均分
  const averageScore = useMemo(() => {
    if (!result?.evaluations?.length) return 0;
    const total = result.evaluations.reduce((acc, curr) => acc + curr.total_score, 0);
    return Math.round(total / result.evaluations.length);
  }, [result]);

  return (
    <div className='bg-slate-950'>
      <div className="max-w-6xl mx-auto space-y-6 pb-20 bg-slate-950">
        {/* Top Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-cyan-500/10 transition-colors" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <LayoutDashboard className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  {result?.project_name || "测评详情报告"}
                </h2>
              </div>
              <p className="text-slate-400 text-sm flex items-center gap-2">
                <span className="font-mono text-xs opacity-50">RUN_ID: {workflowRunId}</span>
                <span className="w-1 h-1 rounded-full bg-slate-700" />
                <span>智能多专家评审系统 v2.0</span>
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Badge variant={getStatusBadgeVariant()} className="h-8 px-4 rounded-full font-semibold border-none shadow-lg">
                {status === 'running' && <Loader2 className="mr-2 h-3 w-3 animate-spin inline" />}
                {statusText}
              </Badge>

              {result && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadPdf}
                  disabled={downloading}
                  className="bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200"
                >
                  {downloading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Download className="w-4 h-4 mr-2" />
                  导出 PDF
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Terminal Logs */}
        {(status !== 'succeeded' && status !== 'success') && (
          <div className="bg-[#0f172a] border border-slate-800 rounded-xl shadow-2xl overflow-hidden ring-1 ring-slate-800">
            <div className="bg-slate-800/50 px-4 py-2 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">NEURAL_NETWORK_STREAM</span>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20" />
              </div>
            </div>
            <div
              className="h-48 overflow-y-auto px-6 py-4 font-mono text-sm leading-relaxed text-cyan-500/80 custom-scrollbar"
              ref={scrollBoxRef}
            >
              {!progressText ? (
                <div className="flex items-center gap-3 animate-pulse text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>初始化分析引擎，等待核心输出...</span>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap">{progressText}</pre>
              )}
            </div>
          </div>
        )}

        {/* Main Results */}
        {result ? (
          <Tabs defaultValue="summary" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700" onValueChange={setActiveTab}>
            <div className="flex items-center justify-between">
              <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-xl">
                <TabsTrigger value="summary" className="rounded-lg data-[state=active]:bg-cyan-600 data-[state=active]:text-white transition-all">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  综合概览
                </TabsTrigger>
                {result.evaluations.map((ev: SingleEvaluation) => (
                  <TabsTrigger key={ev.judge_tag} value={ev.judge_tag} className="rounded-lg data-[state=active]:bg-cyan-600 data-[state=active]:text-white transition-all">
                    <User className="w-4 h-4 mr-2" />
                    专家 {ev.judge_tag}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="hidden md:flex items-center gap-3 text-sm text-slate-500 font-mono">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                VALIDATED_BY_LLM_PROTOCOL
              </div>
            </div>

            <TabsContent value="summary" className="space-y-6 outline-none">
              <div className="grid md:grid-cols-4 gap-6">
                {/* Total Average Score */}
                <Card className="md:col-span-1 bg-slate-900 border-slate-800 shadow-xl overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 to-transparent" />
                  <CardHeader className="text-center relative z-10 pb-2">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-cyan-500/60">平均分</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center relative z-10">
                    <div className="text-7xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                      {averageScore}
                    </div>
                    <div className="text-slate-500 font-mono text-sm mt-1">/ 100 PTS</div>
                    <div className="mt-6 flex items-center justify-center gap-2 text-emerald-400 bg-emerald-400/10 py-1.5 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3" />
                      测评已通过
                    </div>
                  </CardContent>
                </Card>

                {/* Individual Scores Grid */}
                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {result.evaluations.map((ev: SingleEvaluation) => (
                    <Card key={ev.judge_tag} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors group cursor-pointer" onClick={() => setActiveTab(ev.judge_tag)}>
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-center">
                          <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/5">专家 {ev.judge_tag}</Badge>
                          <span className="text-xl font-bold text-white group-hover:text-cyan-400 transition-colors">{ev.total_score}</span>
                        </div>
                        <CardTitle className="text-sm font-semibold text-slate-300 mt-2">{ev.judge_style}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed italic">
                          "{ev.overall_comment}"
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Overall Comments Combined */}
              <div className="grid md:grid-cols-1 gap-6">
                  <Card className="bg-slate-900 border-slate-800">
                      <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2 text-white">
                              <Users className="w-5 h-5 text-cyan-400" />
                              多专家联席评审总结
                          </CardTitle>
                          <CardDescription>汇总自三位独立视角的专业评审意见</CardDescription>
                      </CardHeader>
                      <CardContent className="grid md:grid-cols-3 gap-8">
                          {result.evaluations.map((ev: SingleEvaluation) => (
                              <div key={ev.judge_tag} className="space-y-3">
                                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                                      <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold text-cyan-400">
                                          {ev.judge_tag}
                                      </div>
                                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{ev.judge_style}</span>
                                  </div>
                                  <p className="text-sm text-slate-400 leading-relaxed text-justify">
                                      {ev.overall_comment}
                                  </p>
                              </div>
                          ))}
                      </CardContent>
                  </Card>
              </div>
            </TabsContent>

            {result.evaluations.map((ev: SingleEvaluation) => (
              <TabsContent key={ev.judge_tag} value={ev.judge_tag} className="space-y-6 outline-none">
                {/* Expert Info Header */}
                <div className="grid md:grid-cols-4 gap-6">
                  <Card className="md:col-span-1 bg-slate-900 border-slate-800">
                      <CardContent className="pt-6 text-center space-y-4">
                          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 mx-auto border border-cyan-500/20">
                              <User className="w-8 h-8" />
                          </div>
                          <div>
                              <h3 className="text-lg font-bold text-white">评审专家 {ev.judge_tag}</h3>
                              <p className="text-xs text-cyan-500 font-mono mt-1">{ev.judge_style}</p>
                          </div>
                          <div className="pt-4 border-t border-slate-800">
                              <div className="text-4xl font-black text-white">{ev.total_score}</div>
                              <div className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-widest">Score Awarded</div>
                          </div>
                      </CardContent>
                  </Card>
                  <Card className="md:col-span-3 bg-slate-900 border-slate-800">
                      <CardHeader>
                          <CardTitle className="text-sm font-bold text-slate-400 uppercase tracking-widest">视角综述</CardTitle>
                      </CardHeader>
                      <CardContent>
                          <p className="text-slate-300 leading-relaxed text-lg italic">
                              "{ev.overall_comment}"
                          </p>
                      </CardContent>
                  </Card>
                </div>

                {/* Dimensions */}
                <div className="space-y-6">
                  {ev.dimensions.map((dim: JudgeDimension) => (
                    <DimensionCard key={dim.dimension_name} dimension={dim} />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : isLoading ? (
          <div className="py-32 text-center">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full" />
              <Loader2 className="h-16 w-16 animate-spin text-cyan-500 relative" />
            </div>
            <p className="text-slate-400 mt-8 font-mono tracking-widest uppercase text-sm animate-pulse">正在解析神经元回传数据...</p>
          </div>
        ) : (status === 'error' || status === 'failed') ? (
          <div className="py-20">
            <Alert variant="destructive" className="max-w-xl mx-auto bg-red-950/20 border-red-900/50 text-red-200 shadow-2xl">
              <XCircle className="h-5 w-5" />
              <AlertTitle className="text-lg font-bold mb-2">系统分析中断</AlertTitle>
              <AlertDescription className="text-sm opacity-80 leading-relaxed">
                分析引擎遇到不可恢复的错误。这可能是由于文档格式不符合规范或核心算力节点异常导致的。
                请检查上方控制台输出的详细 Debug 日志。
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DimensionCard({ dimension }: { dimension: JudgeDimension }) {
  return (
    <Card className="bg-slate-900 border-slate-800 overflow-hidden">
      <CardHeader className="pb-6 bg-slate-800/20 border-b border-slate-800/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <BarChart3 className="w-5 h-5" />
            </div>
            <div>
                <CardTitle className="text-lg text-white font-bold">{dimension.dimension_name}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="bg-slate-800/50 border-slate-700 text-slate-400 text-[10px] px-2 py-0">
                        权重 {(dimension.dimension_weight * 100).toFixed(0)}%
                    </Badge>
                </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-white leading-none">
              {dimension.dimension_score}
              <span className="text-sm font-normal text-slate-500 ml-1">/ {dimension.dimension_max_score}</span>
            </div>
          </div>
        </div>
        <Progress
          value={(dimension.dimension_score / (dimension.dimension_max_score || 1)) * 100}
          className="h-1.5 mt-6 bg-slate-800"
        />
      </CardHeader>
      <CardContent className="pt-8">
        <div className="grid md:grid-cols-2 gap-10">
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
    <div className="space-y-4 group">
      <div className="flex justify-between items-start border-b border-slate-800 pb-3">
        <div className="flex items-start gap-3">
            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.5)]" />
            <span className="font-bold text-slate-200 text-sm group-hover:text-white transition-colors">
            {point.point_name}
            </span>
        </div>
        <span className="font-mono font-black text-cyan-400 text-sm">
          {point.score} <span className="text-slate-600 font-normal">/ {point.max_score}</span>
        </span>
      </div>

      <div className="space-y-4">
        <div className="text-sm leading-relaxed text-slate-400 text-justify">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 block mb-2">评审观察 Observation</span>
            {point.reason}
        </div>

        {point.improve && (
            <div className="bg-amber-500/5 border-l-2 border-amber-500/50 p-4 rounded-r-lg">
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">改进建议 Recommendation</span>
                </div>
                <p className="text-xs text-amber-200/70 leading-relaxed italic">
                    {point.improve}
                </p>
            </div>
        )}
      </div>
    </div>
  );
}
