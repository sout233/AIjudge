import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Scale,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { judgeApi } from '@/api/judge';
import { useJudgePolling } from '@/hooks/useJudgePolling';
import { getJudgeSummaryScore, isMultiJudgeResult } from '@/lib/judge-result';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { JudgeDimension, JudgePoint, JudgeResult, MultiJudgeResult } from '@/types';

export function ResultPage() {
  const { workflowRunId } = useParams<{ workflowRunId: string }>();
  const navigate = useNavigate();
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { status, statusText, progressText, result, isLoading } = useJudgePolling(workflowRunId);

  const isMultiJudge = result ? isMultiJudgeResult(result) : false;
  const multiJudgeResult = isMultiJudge ? (result as MultiJudgeResult) : null;
  const singleJudgeResult = result && !isMultiJudge ? (result as JudgeResult) : null;

  useEffect(() => {
    if (scrollBoxRef.current) {
      scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight;
    }
  }, [progressText]);

  const getStatusBadgeVariant = () => {
    switch (status) {
      case 'running':
        return 'secondary';
      case 'succeeded':
      case 'success':
        return 'default';
      case 'error':
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
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

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-sm">
          <div>
            <h2 className="text-2xl font-bold">
              {isMultiJudge && multiJudgeResult?.project_name ? multiJudgeResult.project_name : '评分详情报告'}
            </h2>
            {isMultiJudge && (
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                多评委评审模式（{multiJudgeResult?.evaluations.length} 位评委）
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={getStatusBadgeVariant()} className="px-3 py-1 text-sm">
              {status === 'running' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
              {statusText}
            </Badge>

            {result && (
              <Button size="sm" onClick={downloadPdf} disabled={downloading}>
                {downloading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Download className="mr-2 h-4 w-4" />
                下载 PDF
              </Button>
            )}
          </div>
        </div>

        {status !== 'succeeded' && status !== 'success' && (
          <div className="overflow-hidden rounded-lg bg-[#1e1e1e] text-gray-300 shadow-lg">
            <div
              className="terminal-scroll h-48 overflow-y-auto px-4 py-3 font-mono text-sm"
              ref={scrollBoxRef}
            >
              {!progressText ? (
                <span className="animate-pulse text-gray-600">Waiting for system output...</span>
              ) : (
                <pre className="whitespace-pre-wrap">{progressText}</pre>
              )}
            </div>
          </div>
        )}

        {result ? (
          <div className="animate-in space-y-6 fade-in duration-500">
            {isMultiJudge && multiJudgeResult ? (
              <MultiJudgeView result={multiJudgeResult} />
            ) : singleJudgeResult ? (
              <SingleJudgeView result={singleJudgeResult} />
            ) : (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>无法解析评审结果</AlertTitle>
                <AlertDescription>结果格式不正确，请联系管理员。</AlertDescription>
              </Alert>
            )}
          </div>
        ) : isLoading ? (
          <div className="py-20 text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">正在接收分析数据...</p>
          </div>
        ) : status === 'error' || status === 'failed' ? (
          <div className="py-10">
            <Alert variant="destructive" className="mx-auto max-w-lg">
              <XCircle className="h-4 w-4" />
              <AlertTitle>分析未能完成</AlertTitle>
              <AlertDescription>请查看上方日志获取详细错误信息。</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {result && (
          <div className="flex justify-center pb-4 pt-8">
            <Button
              size="lg"
              onClick={() => navigate('/submit')}
              className="h-12 bg-cyan-600 px-8 text-base font-semibold text-white hover:bg-cyan-500"
            >
              完成，进行下一次评审
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MultiJudgeView({ result }: { result: MultiJudgeResult }) {
  const [activeJudge, setActiveJudge] = useState<string>(result.evaluations[0]?.judge_tag || 'A');
  const summary = getJudgeSummaryScore(result);
  const scores = result.evaluations.map((evaluation) => evaluation.total_score);
  const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {summary.usesFinalReview ? '最终总分' : '平均分'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-center">
            <div className="text-5xl font-bold text-primary">
              {summary.totalScore}
              <span className="text-xl font-normal text-muted-foreground">/{summary.maxScore}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-green-600">
              {summary.usesFinalReview ? '平台汇总结论' : '旧结构平均分回退'}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-sm font-medium text-muted-foreground">最高分</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-center">
            <div className="text-4xl font-bold text-green-600">{highestScore}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {result.evaluations.find((evaluation) => evaluation.total_score === highestScore)?.judge_style}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-sm font-medium text-muted-foreground">最低分</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-center">
            <div className="text-4xl font-bold text-orange-500">{lowestScore}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {result.evaluations.find((evaluation) => evaluation.total_score === lowestScore)?.judge_style}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-sm font-medium text-muted-foreground">分差</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-center">
            <div className="text-4xl font-bold text-blue-500">{highestScore - lowestScore}</div>
            <p className="mt-2 text-xs text-muted-foreground">评委评分一致性指标</p>
          </CardContent>
        </Card>
      </div>

      {(summary.finalComment || summary.scoreReason) && (
        <div className="grid gap-4 md:grid-cols-2">
          {summary.finalComment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5" />
                  最终评审结论
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{summary.finalComment}</p>
              </CardContent>
            </Card>
          )}

          {summary.scoreReason && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Scale className="h-5 w-5" />
                  评分依据
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{summary.scoreReason}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Tabs value={activeJudge} onValueChange={setActiveJudge}>
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${result.evaluations.length}, 1fr)` }}>
          {result.evaluations.map((evaluation) => (
            <TabsTrigger key={evaluation.judge_tag} value={evaluation.judge_tag} className="flex items-center gap-2">
              <User className="h-4 w-4" />
              评委 {evaluation.judge_tag}
            </TabsTrigger>
          ))}
        </TabsList>

        {result.evaluations.map((evaluation) => (
          <TabsContent key={evaluation.judge_tag} value={evaluation.judge_tag} className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <span className="text-xl font-bold text-primary">{evaluation.judge_tag}</span>
                    </div>
                    <div>
                      <CardTitle className="text-lg">评委 {evaluation.judge_tag}</CardTitle>
                      <p className="text-sm text-muted-foreground">{evaluation.judge_style}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-primary">
                      {evaluation.total_score}
                      <span className="text-lg font-normal text-muted-foreground">/{evaluation.max_score}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted/50 p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4" />
                    评委视角总评
                  </h4>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {evaluation.overall_comment}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Award className="h-5 w-5" />
                详细评分维度
              </h3>
              {evaluation.dimensions?.map((dimension) => (
                <DimensionCard key={dimension.dimension_name} dimension={dimension} />
              ))}
              {(!evaluation.dimensions || evaluation.dimensions.length === 0) && (
                <Alert variant="default" className="border-yellow-200 bg-yellow-50">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertTitle className="text-yellow-800">评分维度数据缺失</AlertTitle>
                  <AlertDescription className="text-yellow-700">
                    该评委的评审结果中未包含详细的评分维度信息。
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function SingleJudgeView({ result }: { result: JudgeResult }) {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader className="text-center">
            <CardTitle className="text-sm font-medium text-muted-foreground">综合得分</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-6xl font-bold text-primary">
              {result.total_score}
              <span className="text-2xl font-normal text-muted-foreground">/{result.max_score}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-green-600">AI 评审完成</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              评审总结
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-justify leading-relaxed">{result.overall_comment}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {result.dimensions?.map((dimension) => (
          <DimensionCard key={dimension.dimension_name} dimension={dimension} />
        ))}
        {(!result.dimensions || result.dimensions.length === 0) && (
          <Alert variant="default" className="border-yellow-200 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800">评分维度数据缺失</AlertTitle>
            <AlertDescription className="text-yellow-700">
              评审结果中未包含详细的评分维度信息，请查看上方评审总结。
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}

interface DimensionCardProps {
  dimension: JudgeDimension;
}

function DimensionCard({ dimension }: DimensionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">{dimension.dimension_name}</CardTitle>
            <Badge variant="secondary">权重 {(dimension.dimension_weight * 100).toFixed(0)}%</Badge>
          </div>
          <div className="text-xl font-bold">
            {dimension.dimension_score}
            <span className="text-sm font-normal text-muted-foreground"> / {dimension.dimension_max_score}</span>
          </div>
        </div>
        <Progress value={dimension.dimension_score} max={dimension.dimension_max_score} className="mt-2 h-2" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {dimension.points.map((point) => (
            <PointCard key={point.point_name} point={point} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface PointCardProps {
  point: JudgePoint;
}

function PointCard({ point }: PointCardProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <div className="h-2 w-2 rounded-full bg-primary" />
          {point.point_name}
        </span>
        <span className="font-mono font-bold text-primary">
          {point.score}/{point.max_score}
        </span>
      </div>

      <div className="text-sm text-muted-foreground">
        <span className="mb-1 block text-xs font-semibold text-foreground">评语</span>
        {point.reason}
      </div>

      {point.improve && (
        <Alert className="border-yellow-200 bg-yellow-50 text-yellow-900">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-xs text-yellow-800">改进建议</AlertTitle>
          <AlertDescription className="text-xs text-yellow-700">{point.improve}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
