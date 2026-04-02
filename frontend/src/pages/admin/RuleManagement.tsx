import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileJson, Info, Loader2, FileText, Layout, Code, Plus, Trash2, FolderTree } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Contest, Track, RuleDimension, RulePoint } from '@/types';

// 定义评分等级类型
const LEVELS = ['优秀', '良好', '一般', '差'] as const;
type ScoreLevel = typeof LEVELS[number];

interface ScoreLevels {
  [key: string]: [number, number];
}

interface ExtendedRulePoint extends RulePoint {
  score_levels?: ScoreLevels;
}

interface ExtendedRuleDimension extends RuleDimension {
  points: ExtendedRulePoint[];
}

interface ExtendedRuleConfig {
  total_score: number;
  dimensions: ExtendedRuleDimension[];
}

interface RuleTargetOption {
  id: string;
  type: 'contest' | 'track';
  contest: Contest;
  track?: Track;
}

// 定义处理步骤文案
const processingSteps = [
  '正在深入解析文档结构...',
  '识别评审维度与权重分配...',
  '提取各评审要点的原文约束...',
  "正在计算'优秀、良好、一般、差'分值区间...",
  '校验维度总分是否严谨闭环（100分）...',
  '正在生成标准 JSON 配置文件...',
  '即将完成，正在进行最后的格式校验...',
];

// ProcessingOverlay 组件
function ProcessingOverlay({ progress }: { progress: number }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % processingSteps.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <Card className="w-[420px] border-primary/20 shadow-2xl bg-card/95">
        <CardContent className="pt-8 flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <div className="relative bg-primary text-primary-foreground p-4 rounded-full shadow-lg">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          </div>

          <div className="space-y-4 w-full">
            <div className="space-y-1">
              <h3 className="font-semibold text-xl text-primary tracking-tight">AI 智能解析中</h3>
              <p
                key={stepIndex}
                className="text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-500"
              >
                {processingSteps[stepIndex]}
              </p>
            </div>

            <div className="px-4">
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 px-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Processing</span>
                <span className="text-[10px] font-mono text-primary">{Math.round(progress)}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// 获取所有可配置规则的目标
function useRuleTargets(contests: Contest[]) {
  return useMemo(() => {
    const targets: RuleTargetOption[] = [];
    contests.forEach((contest) => {
      if ((contest.tracks || []).length > 0) {
        (contest.tracks || []).forEach((track) => {
          targets.push({
            id: track.id,
            type: 'track',
            contest,
            track,
          });
        });
        return;
      }

      targets.push({
        id: contest.id,
        type: 'contest',
        contest,
      });
    });
    return targets;
  }, [contests]);
}

export function RuleManagement() {
  const queryClient = useQueryClient();
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'visual' | 'source'>('visual');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const standardFileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const { data: contests = [] } = useQuery({
    queryKey: ['contests'],
    queryFn: adminApi.getContests,
  });

  const ruleTargets = useRuleTargets(contests);

  const { data: ruleData, isLoading: loadingRule } = useQuery({
    queryKey: ['rule', selectedRuleId],
    queryFn: () => adminApi.getRule(selectedRuleId),
    enabled: !!selectedRuleId,
  });

  useEffect(() => {
    if (ruleData) {
      setContent(JSON.stringify(ruleData, null, 2));
    } else if (selectedRuleId) {
      setContent(JSON.stringify({ total_score: 100, dimensions: [] }, null, 2));
    }
  }, [ruleData, selectedRuleId]);

  // 解析当前内容为对象
  const getParsedContent = (): ExtendedRuleConfig => {
    try {
      return JSON.parse(content) as ExtendedRuleConfig;
    } catch {
      return { total_score: 100, dimensions: [] };
    }
  };

  // 更新 JSON 内容的辅助函数
  const updateContent = (newObj: ExtendedRuleConfig) => {
    setContent(JSON.stringify(newObj, null, 2));
  };

  const saveMutation = useMutation({
    mutationFn: ({ ruleId, content }: { ruleId: string; content: string }) =>
      adminApi.saveRule(ruleId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rule', selectedRuleId] });
      alert('规则保存成功');
    },
    onError: () => alert('保存失败'),
  });

  const handleSaveContent = () => {
    if (!selectedRuleId) return;
    try {
      JSON.parse(content);
    } catch {
      alert('JSON 格式错误，请检查源码视图');
      return;
    }
    saveMutation.mutate({ ruleId: selectedRuleId, content });
  };

  // --- 图形化编辑逻辑 ---

  const updateDimension = (dIdx: number, field: keyof ExtendedRuleDimension, value: string | number) => {
    const data = getParsedContent();
    data.dimensions[dIdx][field] = value as never;
    updateContent(data);
  };

  const addDimension = () => {
    const data = getParsedContent();
    data.dimensions.push({
      dimension_name: '新维度',
      dimension_weight: 0,
      dimension_max_score: 0,
      points: [],
    });
    updateContent(data);
  };

  const removeDimension = (dIdx: number) => {
    const data = getParsedContent();
    data.dimensions.splice(dIdx, 1);
    updateContent(data);
  };

  const updatePoint = (dIdx: number, pIdx: number, field: keyof ExtendedRulePoint, value: string | number) => {
    const data = getParsedContent();
    data.dimensions[dIdx].points[pIdx][field] = value as never;
    updateContent(data);
  };

  const addPoint = (dIdx: number) => {
    const data = getParsedContent();
    const defaultLevels: ScoreLevels = {
      优秀: [0, 0],
      良好: [0, 0],
      一般: [0, 0],
      差: [0, 0],
    };
    data.dimensions[dIdx].points.push({
      point_name: '新评分项',
      max_score: 0,
      score_levels: defaultLevels,
    });
    updateContent(data);
  };

  const removePoint = (dIdx: number, pIdx: number) => {
    const data = getParsedContent();
    data.dimensions[dIdx].points.splice(pIdx, 1);
    updateContent(data);
  };

  const updateLevel = (
    dIdx: number,
    pIdx: number,
    level: ScoreLevel,
    boundIdx: 0 | 1,
    value: string
  ) => {
    const data = getParsedContent();
    const val = parseFloat(value) || 0;
    const point = data.dimensions[dIdx].points[pIdx];
    if (!point.score_levels) {
      point.score_levels = {
        优秀: [0, 0],
        良好: [0, 0],
        一般: [0, 0],
        差: [0, 0],
      };
    }
    point.score_levels[level][boundIdx] = val;
    updateContent(data);
  };

  // --- 其他上传逻辑 ---
  const uploadMutation = useMutation({
    mutationFn: ({ ruleId, file }: { ruleId: string; file: File }) => adminApi.saveRule(ruleId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rule', selectedRuleId] });
      alert('文件上传成功');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: () => {
      alert('上传失败');
    },
  });

  const processStandardMutation = useMutation({
    mutationFn: (file: File) => adminApi.processScoringStandard(selectedRuleId, file),
    onSuccess: (result) => {
      setContent(JSON.stringify(result, null, 2));
      if (standardFileInputRef.current) standardFileInputRef.current.value = '';
    },
    onError: () => {
      alert('评分标准处理失败');
    },
    onSettled: () => {
      setIsProcessing(false);
    },
  });

  const handleUpload = () => {
    if (!selectedRuleId) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      alert('请先选择文件');
      return;
    }
    uploadMutation.mutate({ ruleId: selectedRuleId, file });
  };

  // 模拟进度的函数
  const startProgressAnimation = () => {
    setLoadingProgress(0);
    const interval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        // 分段式增长，越接近95%越慢，增加阻滞感
        let increment: number;
        if (prev < 30) {
          increment = 2.5; // 前期较快
        } else if (prev < 60) {
          increment = 1.8; // 中期中等
        } else if (prev < 85) {
          increment = 1.0; // 后期开始变慢
        } else {
          increment = 0.3; // 接近95%时非常慢，产生阻滞感
        }
        return prev + increment;
      });
    }, 120); // 稍微增加间隔，让动画更平滑
    return interval;
  };

  const handleProcessStandard = async () => {
    const file = standardFileInputRef.current?.files?.[0];
    if (!file) {
      alert('请先选择评分标准文档');
      return;
    }

    // 1. 开启 Loading 和动画
    setIsProcessing(true);
    const progressInterval = startProgressAnimation();
    const startTime = Date.now();

    try {
      // 2. 发起请求
      const result = await processStandardMutation.mutateAsync(file);

      // 3. 计算耗时，确保至少展示 1000ms
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1000 - elapsedTime);

      // 4. 等待剩余时间，并把进度条拉满
      setTimeout(() => {
        clearInterval(progressInterval);
        setLoadingProgress(100); // 拉满进度

        // 给 200ms 让用户看清 100% 的状态
        setTimeout(() => {
          setContent(JSON.stringify(result, null, 2));
          setIsProcessing(false);
          alert('评分标准处理成功');
          if (standardFileInputRef.current) standardFileInputRef.current.value = '';
        }, 200);
      }, remainingTime);
    } catch {
      clearInterval(progressInterval);
      setIsProcessing(false);
    }
  };

  const parsedData = getParsedContent();

  // 获取当前选中的规则目标信息
  const selectedTargetInfo = useMemo(() => {
    return ruleTargets.find((target) => target.id === selectedRuleId);
  }, [ruleTargets, selectedRuleId]);

  return (
    <div className="relative space-y-6">
      {/* 渲染 Loading 遮罩 */}
      {isProcessing && <ProcessingOverlay progress={loadingProgress} />}

      <h2 className="text-2xl font-bold">评分规则配置</h2>

      {/* 配置目标选择 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">选择配置目标</label>
        <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
          <SelectTrigger className="max-w-md">
            <SelectValue placeholder="请选择竞赛或赛道..." />
          </SelectTrigger>
          <SelectContent>
            {contests.map((contest: Contest) => (
              <div key={contest.id}>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted">
                  {contest.name}
                </div>
                {(contest.tracks || []).length === 0 ? (
                  <SelectItem value={contest.id}>
                    <div className="flex items-center gap-2">
                      <FileJson className="w-3 h-3" />
                      竞赛通用规则
                    </div>
                  </SelectItem>
                ) : (
                  (contest.tracks || []).map((track: Track) => (
                    <SelectItem key={track.id} value={track.id}>
                      <div className="flex items-center gap-2">
                        <FolderTree className="w-3 h-3" />
                        {track.name}
                      </div>
                    </SelectItem>
                  ))
                )}
              </div>
            ))}
          </SelectContent>
        </Select>
        {selectedTargetInfo && (
          <div className="text-sm text-muted-foreground">
            所属竞赛: <span className="font-medium">{selectedTargetInfo.contest.name}</span>
            <span className="ml-2">
              当前配置:
              <span className="font-medium ml-1">
                {selectedTargetInfo.type === 'track'
                  ? `赛道规则 - ${selectedTargetInfo.track?.name ?? ''}`
                  : '竞赛通用规则'}
              </span>
            </span>
            {selectedTargetInfo.track?.description && (
              <span className="ml-2">- {selectedTargetInfo.track.description}</span>
            )}
          </div>
        )}
      </div>

      {selectedRuleId ? (
        <div className="space-y-6">
          {loadingRule ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              {/* Option A: 双视图编辑 */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileJson className="w-4 h-4" /> 方式 A: 规则编辑
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    <Button size="sm" onClick={handleSaveContent} disabled={saveMutation.isPending}>
                      {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      保存规则配置
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs
                    value={viewMode}
                    onValueChange={(v) => setViewMode(v as 'visual' | 'source')}
                    className="w-full"
                  >
                    <TabsList className="mb-4">
                      <TabsTrigger value="visual" className="flex items-center gap-2">
                        <Layout className="w-3.5 h-3.5" /> 图形化视图
                      </TabsTrigger>
                      <TabsTrigger value="source" className="flex items-center gap-2">
                        <Code className="w-3.5 h-3.5" /> 源码视图
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="source">
                      <Textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="min-h-[500px] font-mono text-xs bg-slate-50"
                        spellCheck={false}
                      />
                    </TabsContent>

                    <TabsContent value="visual" className="space-y-4">
                      <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm font-medium">总分设定:</span>
                        <Input
                          type="number"
                          className="w-24 h-8"
                          value={parsedData.total_score}
                          onChange={(e) =>
                            updateContent({ ...parsedData, total_score: Number(e.target.value) })
                          }
                        />
                      </div>

                      {parsedData.dimensions?.map((dim, dIdx) => (
                        <div key={dIdx} className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
                          <div className="flex items-center gap-3 pb-3 border-b">
                            <Input
                              placeholder="维度名称"
                              className="font-bold h-8"
                              value={dim.dimension_name}
                              onChange={(e) => updateDimension(dIdx, 'dimension_name', e.target.value)}
                            />
                            <div className="flex items-center gap-2 shrink-0 text-xs">
                              <span>权重:</span>
                              <Input
                                type="number"
                                className="w-16 h-8"
                                value={dim.dimension_weight}
                                onChange={(e) =>
                                  updateDimension(dIdx, 'dimension_weight', Number(e.target.value))
                                }
                              />
                              <span>满分:</span>
                              <Input
                                type="number"
                                className="w-16 h-8"
                                value={dim.dimension_max_score}
                                onChange={(e) =>
                                  updateDimension(dIdx, 'dimension_max_score', Number(e.target.value))
                                }
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive h-8 w-8"
                              onClick={() => removeDimension(dIdx)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>

                          <div className="pl-4 space-y-4 border-l-2 border-primary/20">
                            {dim.points?.map((point, pIdx) => (
                              <div
                                key={pIdx}
                                className="space-y-2 bg-slate-50/50 p-3 rounded border border-dashed"
                              >
                                <div className="flex items-center gap-3">
                                  <Input
                                    placeholder="评分项名称"
                                    className="h-8 text-sm"
                                    value={point.point_name}
                                    onChange={(e) =>
                                      updatePoint(dIdx, pIdx, 'point_name', e.target.value)
                                    }
                                  />
                                  <div className="flex items-center gap-2 shrink-0 text-xs">
                                    <span>分值:</span>
                                    <Input
                                      type="number"
                                      className="w-16 h-8"
                                      value={point.max_score}
                                      onChange={(e) =>
                                        updatePoint(dIdx, pIdx, 'max_score', Number(e.target.value))
                                      }
                                    />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => removePoint(dIdx, pIdx)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>

                                <div className="grid grid-cols-4 gap-2">
                                  {LEVELS.map((lvl) => (
                                    <div key={lvl} className="space-y-1">
                                      <span className="text-[10px] text-muted-foreground font-medium">
                                        {lvl}区间
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          className="h-7 px-1 text-[10px]"
                                          value={point.score_levels?.[lvl]?.[0] ?? 0}
                                          onChange={(e) =>
                                            updateLevel(dIdx, pIdx, lvl, 0, e.target.value)
                                          }
                                        />
                                        <span className="text-xs">-</span>
                                        <Input
                                          type="number"
                                          className="h-7 px-1 text-[10px]"
                                          value={point.score_levels?.[lvl]?.[1] ?? 0}
                                          onChange={(e) =>
                                            updateLevel(dIdx, pIdx, lvl, 1, e.target.value)
                                          }
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full border-dashed h-8 text-xs"
                              onClick={() => addPoint(dIdx)}
                            >
                              <Plus className="w-3 h-3 mr-1" /> 添加评审要点
                            </Button>
                          </div>
                        </div>
                      ))}

                      <Button
                        variant="outline"
                        className="w-full h-12 border-2 border-dashed"
                        onClick={addDimension}
                      >
                        <Plus className="w-4 h-4 mr-2" /> 新增评分维度
                      </Button>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Option B: File Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    方式 B: 上传规则文件 (JSON)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 max-w-lg">
                    <Input
                      type="file"
                      ref={fileInputRef}
                      accept=".json"
                      className="flex-1"
                    />
                    <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
                      {uploadMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      上传覆盖
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Option C: Upload Scoring Standard Document */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    方式 C: 上传评分标准文档
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 max-w-lg">
                    <Input
                      type="file"
                      ref={standardFileInputRef}
                      accept=".pdf,.doc,.docx,.txt"
                      className="flex-1"
                      disabled={isProcessing}
                    />
                    <Button onClick={handleProcessStandard} disabled={isProcessing}>
                      {isProcessing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        '处理文档'
                      )}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    支持上传PDF、Word或文本文件作为评分标准，系统将自动解析并生成JSON格式的评分规则
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-lg">
          <Info className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">请先选择竞赛或赛道以配置规则</p>
        </div>
      )}
    </div>
  );
}
