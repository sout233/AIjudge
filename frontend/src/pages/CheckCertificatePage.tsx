import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Search, CheckCircle2, AlertTriangle, XCircle, FileText, Loader2, Shield, RefreshCw, X } from 'lucide-react';
import { judgeApi } from '@/api/judge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type VerificationStatus = 'idle' | 'loading' | 'success' | 'not_found' | 'mismatch';

interface CaptchaTask {
  session_id: string;
  wait_time: number;
  width: number;
  height: number;
  bg_image: string;
}

interface Point {
  x: number;
  y: number;
}

export function CheckCertificatePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<VerificationStatus>('idle');

  // 表单状态
  const [regNo, setRegNo] = useState('');
  const [owner, setOwner] = useState('');
  const [softName, setSoftName] = useState('');

  // 验证码弹窗状态
  const [captchaDialogOpen, setCaptchaDialogOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<CaptchaTask | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedTasksRef = useRef<Set<string>>(new Set());

  const API_BASE = "http://127.0.0.1:8000/api/verify";

  // 后台轮询检查验证码任务
  const checkCaptchaTasks = useCallback(async () => {
    // 如果当前已有弹窗打开，跳过本次检查
    if (captchaDialogOpen) return;

    try {
      const res = await fetch(`${API_BASE}/pending`);
      const result = await res.json();
      const tasks: CaptchaTask[] = result.data || [];

      setPendingCount(tasks.length);

      // 查找未处理的任务
      const unprocessedTask = tasks.find(task => !processedTasksRef.current.has(task.session_id));

      if (unprocessedTask) {
        // 标记为已处理，避免重复弹出
        processedTasksRef.current.add(unprocessedTask.session_id);
        setCurrentTask(unprocessedTask);
        setPoints([]);
        setCaptchaDialogOpen(true);
      }
    } catch (error) {
      console.error("检查验证码任务失败", error);
    }
  }, [captchaDialogOpen, API_BASE]);

  // 启动后台轮询
  useEffect(() => {
    checkCaptchaTasks(); // 立即执行一次
    intervalRef.current = setInterval(checkCaptchaTasks, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkCaptchaTasks]);

  // 证书核验功能
  const handleVerify = async () => {
    if (!regNo || (!owner && !softName)) {
      alert("请填写登记号，并至少填写著作权人或软件名称中的一项");
      return;
    }

    setStatus('loading');
    try {
      const response = await judgeApi.verifyCertificate(regNo, owner, softName);

      if (response.status === 'success') {
        setStatus('success');
      } else if (response.status === 'not_found') {
        setStatus('not_found');
      } else if (response.status === 'mismatch') {
        setStatus('mismatch');
      } else {
        setStatus('not_found');
      }
    } catch (error) {
      console.error('验证失败:', error);
      alert('验证失败，请稍后重试');
      setStatus('idle');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('loading');
    try {
      const response = await judgeApi.uploadAndVerifyCertificate(file);

      if (response.status === 'success') {
        setRegNo(response.reg_no || '');
        setOwner(response.owner || '');
        setSoftName(response.soft_name || '');
        setStatus('success');
      } else if (response.status === 'not_found') {
        setStatus('not_found');
      } else if (response.status === 'mismatch') {
        setStatus('mismatch');
      } else {
        setStatus('not_found');
      }
    } catch (error) {
      console.error('文件验证失败:', error);
      alert('文件验证失败，请稍后重试');
      setStatus('idle');
    }
  };

  // 验证码处理功能
  const recordPoint = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentTask) return;

    const wrapper = e.currentTarget;
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPoints(prev => [...prev, { x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)) }]);
  };

  const resetPoints = () => {
    setPoints([]);
  };

  const submitCaptcha = async () => {
    if (!currentTask || points.length === 0) {
      alert("请先标注坐标");
      return;
    }

    setIsSubmitting(true);

    try {
      await fetch(`${API_BASE}/submit-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: currentTask.session_id, points: points })
      });

      // 关闭弹窗并重置状态
      setCaptchaDialogOpen(false);
      setCurrentTask(null);
      setPoints([]);
    } catch (error) {
      alert("提交异常");
    } finally {
      setIsSubmitting(false);
    }
  };

  const skipCurrentTask = () => {
    setCaptchaDialogOpen(false);
    setCurrentTask(null);
    setPoints([]);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 px-4">
      <Button variant="ghost" onClick={() => navigate('/')} className="group">
        <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
        返回首页
      </Button>

      {/* 页面标题 */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">证书真伪核验</h1>
        <p className="text-muted-foreground">通过官方数据库实时核对软件著作权登记证书的真实性</p>

        {/* 后台轮询状态指示器 */}
        {pendingCount > 0 && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-2">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>系统后台检测中</span>
            <Badge variant="secondary" className="text-xs">
              {pendingCount} 个待处理任务
            </Badge>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左侧：文件上传识别 */}
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" /> 快速上传识别
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
            >
              <FileText className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-xs text-center text-muted-foreground">点击上传扫描件、PDF<br/>自动提取登记号信息</p>
              <input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept=".pdf,.jpg,.jpeg,.png"
              />
            </div>
          </CardContent>
        </Card>

        {/* 右侧：手动输入 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" /> 手动录入信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="regNo">登记号 <span className="text-destructive">*</span></Label>
              <Input id="regNo" placeholder="如: 2024SR012345" value={regNo} onChange={e => setRegNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner">著作权人</Label>
              <Input id="owner" placeholder="公司或个人名称" value={owner} onChange={e => setOwner(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="softName">软件名称</Label>
              <Input id="softName" placeholder="全称或简称" value={softName} onChange={e => setSoftName(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Button className="w-full h-12 text-lg" onClick={handleVerify} disabled={status === 'loading'}>
        {status === 'loading' ? <Loader2 className="mr-2 animate-spin" /> : '开始联网核验'}
      </Button>

      {/* 结果显示区域 */}
      {status !== 'idle' && status !== 'loading' && (
        <div className="animate-in zoom-in-95 duration-300">
          {status === 'success' && (
            <div className="p-6 rounded-xl border bg-green-50 border-green-200 flex items-start gap-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 mt-1" />
              <div>
                <h3 className="text-green-800 font-bold text-lg">校验通过</h3>
                <p className="text-green-700 text-sm">该证书信息与中国版权保护中心登记数据完全一致。</p>
              </div>
            </div>
          )}

          {status === 'not_found' && (
            <div className="p-6 rounded-xl border bg-amber-50 border-amber-200 flex items-start gap-4">
              <AlertTriangle className="h-8 w-8 text-amber-600 mt-1" />
              <div>
                <h3 className="text-amber-800 font-bold text-lg">未查询到相关信息</h3>
                <p className="text-amber-700 text-sm">官方数据库中暂无此登记号记录，请核对输入是否有误或证书是否刚签发。</p>
              </div>
            </div>
          )}

          {status === 'mismatch' && (
            <div className="p-6 rounded-xl border bg-red-50 border-red-200 flex items-start gap-4">
              <XCircle className="h-8 w-8 text-red-600 mt-1" />
              <div>
                <h3 className="text-red-800 font-bold text-lg">信息不匹配</h3>
                <p className="text-red-700 text-sm">系统发现登记号对应的官方著作权人或软件名称与您提供的信息不符，请警惕虚假证书。</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 验证码弹窗 */}
      <Dialog open={captchaDialogOpen} onOpenChange={setCaptchaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              安全验证
            </DialogTitle>
          </DialogHeader>

          {currentTask && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground text-center">
                请点击图片中的目标位置完成验证
                {pendingCount > 1 && (
                  <Badge variant="outline" className="ml-2">
                    剩余 {pendingCount - 1} 个任务
                  </Badge>
                )}
              </div>

              <div
                className="relative cursor-crosshair border rounded-lg overflow-hidden mx-auto shadow-inner bg-muted"
                style={{ width: currentTask.width, height: currentTask.height }}
                onClick={recordPoint}
              >
                <img
                  src={currentTask.bg_image}
                  width={currentTask.width}
                  height={currentTask.height}
                  alt="验证码"
                  className="block"
                />
                {/* 渲染已点击的点 */}
                {points.map((point, index) => (
                  <div
                    key={index}
                    className="absolute w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold transform -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-lg ring-2 ring-white"
                    style={{ left: point.x, top: point.y }}
                  >
                    {index + 1}
                  </div>
                ))}
              </div>

              {/* 坐标显示 */}
              {points.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {points.map((point, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      点{index + 1}: ({point.x}, {point.y})
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={resetPoints}
                  disabled={isSubmitting}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  重置
                </Button>
                <Button
                  variant="outline"
                  onClick={skipCurrentTask}
                  disabled={isSubmitting}
                >
                  <X className="h-4 w-4 mr-2" />
                  跳过
                </Button>
                <Button
                  className="flex-1"
                  onClick={submitCaptcha}
                  disabled={isSubmitting || points.length === 0}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  提交
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CheckCertificatePage;
