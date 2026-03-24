import { useRef, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileText, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { useJudgePolling } from '@/hooks/useJudgePolling';
import { judgeApi } from '@/api/judge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { JudgeDimension, JudgePoint } from '@/types';

export function ResultPage() {
  const { workflowRunId } = useParams<{ workflowRunId: string }>();
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { status, statusText, progressText, result, isLoading } = useJudgePolling(workflowRunId);

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
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between bg-card border rounded-lg p-4 shadow-sm">
        <h2 className="text-2xl font-bold">评分详情报告</h2>
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
            {result.dimensions.map((dim: JudgeDimension) => (
              <DimensionCard key={dim.dimension_name} dimension={dim} />
            ))}
          </div>
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
    </div>
  );
}

function DimensionCard({ dimension }: { dimension: JudgeDimension }) {
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

function PointCard({ point }: { point: JudgePoint }) {
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