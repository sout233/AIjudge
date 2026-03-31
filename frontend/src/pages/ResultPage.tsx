import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download, FileText, AlertTriangle, XCircle, Loader2, Users, User, Award } from 'lucide-react';
import { useJudgePolling } from '@/hooks/useJudgePolling';
import { judgeApi } from '@/api/judge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { JudgeDimension, JudgePoint, MultiJudgeResult, JudgeResult } from '@/types';

// 类型守卫：判断是否为新格式的多评委结果
const isMultiJudgeResult = (data: unknown): data is MultiJudgeResult => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'project_name' in data &&
    'evaluations' in data &&
    Array.isArray((data as MultiJudgeResult).evaluations)
  );
};

export function ResultPage() {
  const { workflowRunId } = useParams<{ workflowRunId: string }>();
  const navigate = useNavigate();
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { status, statusText, progressText, result, isLoading } = useJudgePolling(workflowRunId);

  // 判断结果类型
  const isMultiJudge = result && isMultiJudgeResult(result);
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
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between bg-card border rounded-lg p-4 shadow-sm">
          <div>
            <h2 className="text-2xl font-bold">
              {isMultiJudge && multiJudgeResult?.project_name 
                ? multiJudgeResult.project_name 
                : '评分详情报告'}
            </h2>
            {isMultiJudge && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <Users className="w-3 h-3" />
                多评委评审模式 ({multiJudgeResult?.evaluations.length} 位评委)
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={getStatusBadgeVariant()} className="text-sm px-3 py-1">
              {status === 'running' && <Loader2 className="mr-1 h-3 w-3 animate-spin inline" />}
              {statusText}
            </Badge>

            {result && (
              <Button
                size="sm"
                onClick={downloadPdf}
                disabled={downloading}
              >
                {downloading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Download className="w-4 h-4 mr-2" />
                下载 PDF
              </Button>
            )}
          </div>
        </div>

        {/* Terminal Logs */}
        {(status !== 'succeeded' && status !== 'success') && (
          <div className="bg-[#1e1e1e] text-gray-300 rounded-lg shadow-lg overflow-hidden">
            <div
              className="h-48 overflow-y-auto px-4 py-3 font-mono text-sm terminal-scroll"
              ref={scrollBoxRef}
            >
              {!progressText ? (
                <span className="text-gray-600 animate-pulse">Waiting for system output...</span>
              ) : (
                <pre className="whitespace-pre-wrap">{progressText}</pre>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {result ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            {isMultiJudge && multiJudgeResult ? (
              // 多评委结果展示
              <MultiJudgeView result={multiJudgeResult} />
            ) : singleJudgeResult ? (
              // 单评委结果展示（旧格式，向后兼容）
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
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground mt-4">正在接收分析数据...</p>
          </div>
        ) : (status === 'error' || status === 'failed') ? (
          <div className="py-10">
            <Alert variant="destructive" className="max-w-lg mx-auto">
              <XCircle className="h-4 w-4" />
              <AlertTitle>分析未能完成</AlertTitle>
              <AlertDescription>请查看上方日志获取详细错误信息</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {/* 完成按钮 - 跳转到提交页面进行下一次评审 */}
        {result && (
          <div className="flex justify-center pt-8 pb-4">
            <Button
              size="lg"
              onClick={() => navigate('/submit')}
              className="px-8 h-12 text-base font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              完成，进行下一次评审
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// 多评委结果展示组件
function MultiJudgeView({ result }: { result: MultiJudgeResult }) {
  const [activeJudge, setActiveJudge] = useState<string>(result.evaluations[0]?.judge_tag || 'A');
  
  const averageScore = Math.round(
    result.evaluations.reduce((sum, e) => sum + e.total_score, 0) / result.evaluations.length
  );
  const maxScore = result.evaluations[0]?.max_score || 100;

  // 找出最高分和最低分
  const scores = result.evaluations.map(e => e.total_score);
  const highestScore = Math.max(...scores);
  const lowestScore = Math.min(...scores);

  return (
    <div className="space-y-6">
      {/* 综合评分卡片 */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">平均分</CardTitle>
          </CardHeader>
          <CardContent className="text-center pt-0">
            <div className="text-5xl font-bold text-primary">
              {averageScore}
              <span className="text-xl text-muted-foreground font-normal">/{maxScore}</span>
            </div>
            <p className="text-sm text-green-600 font-medium mt-2">多评委综合评分</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">最高分</CardTitle>
          </CardHeader>
          <CardContent className="text-center pt-0">
            <div className="text-4xl font-bold text-green-600">
              {highestScore}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {result.evaluations.find(e => e.total_score === highestScore)?.judge_style}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">最低分</CardTitle>
          </CardHeader>
          <CardContent className="text-center pt-0">
            <div className="text-4xl font-bold text-orange-500">
              {lowestScore}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {result.evaluations.find(e => e.total_score === lowestScore)?.judge_style}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">分差</CardTitle>
          </CardHeader>
          <CardContent className="text-center pt-0">
            <div className="text-4xl font-bold text-blue-500">
              {highestScore - lowestScore}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              评分一致性指标
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 评委选择标签 */}
      <Tabs value={activeJudge} onValueChange={setActiveJudge}>
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${result.evaluations.length}, 1fr)` }}>
          {result.evaluations.map((evaluation) => (
            <TabsTrigger key={evaluation.judge_tag} value={evaluation.judge_tag} className="flex items-center gap-2">
              <User className="w-4 h-4" />
              评委 {evaluation.judge_tag}
            </TabsTrigger>
          ))}
        </TabsList>

        {result.evaluations.map((evaluation) => (
          <TabsContent key={evaluation.judge_tag} value={evaluation.judge_tag} className="space-y-4">
            {/* 评委信息 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
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
                      <span className="text-lg text-muted-foreground font-normal">/{evaluation.max_score}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    综合评价
                  </h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {evaluation.overall_comment}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* 维度评分 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Award className="w-5 h-5" />
                详细评分维度
              </h3>
              {evaluation.dimensions?.map((dim: JudgeDimension) => (
                <DimensionCard key={dim.dimension_name} dimension={dim} />
              ))}
              {(!evaluation.dimensions || evaluation.dimensions.length === 0) && (
                <Alert variant="default" className="bg-yellow-50 border-yellow-200">
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

// 单评委结果展示组件（向后兼容）
function SingleJudgeView({ result }: { result: JudgeResult }) {
  return (
    <>
      {/* Summary Stats */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader className="text-center">
            <CardTitle className="text-sm font-medium text-muted-foreground">综合得分</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-6xl font-bold text-primary">
              {result.total_score}
              <span className="text-2xl text-muted-foreground font-normal">/{result.max_score}</span>
            </div>
            <p className="text-sm text-green-600 font-medium mt-2">AI 评审完成</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              评审总结
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-justify leading-relaxed whitespace-pre-wrap">
              {result.overall_comment}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dimensions */}
      <div className="space-y-4">
        {result.dimensions?.map((dim: JudgeDimension) => (
          <DimensionCard key={dim.dimension_name} dimension={dim} />
        ))}
        {(!result.dimensions || result.dimensions.length === 0) && (
          <Alert variant="default" className="bg-yellow-50 border-yellow-200">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800">评分维度数据缺失</AlertTitle>
            <AlertDescription className="text-yellow-700">
              评审结果中未包含详细的评分维度信息，请查看上方的评审总结。
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
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">{dimension.dimension_name}</CardTitle>
            <Badge variant="secondary">权重 {(dimension.dimension_weight * 100).toFixed(0)}%</Badge>
          </div>
          <div className="text-xl font-bold">
            {dimension.dimension_score}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              / {dimension.dimension_max_score}
            </span>
          </div>
        </div>
        <Progress
          value={dimension.dimension_score}
          max={dimension.dimension_max_score}
          className="h-2 mt-2"
        />
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {dimension.points.map((pt: JudgePoint) => (
            <PointCard key={pt.point_name} point={pt} />
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
      <div className="flex justify-between items-center border-b pb-2">
        <span className="font-medium flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-primary" />
          {point.point_name}
        </span>
        <span className="font-mono font-bold text-primary">
          {point.score}/{point.max_score}
        </span>
      </div>

      <div className="text-sm text-muted-foreground">
        <span className="text-xs font-semibold text-foreground block mb-1">评语</span>
        {point.reason}
      </div>

      {point.improve && (
        <Alert className="bg-yellow-50 border-yellow-200 text-yellow-900">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800 text-xs">改进建议</AlertTitle>
          <AlertDescription className="text-yellow-700 text-xs">
            {point.improve}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
