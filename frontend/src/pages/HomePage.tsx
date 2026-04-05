import { useNavigate } from 'react-router-dom';
import {
  Rocket,
  FileSearch,
  Shield,
  Zap,
  BarChart3,
  Lock,
  ChevronRight,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/stores/authStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';

const features = [
  {
    icon: FileSearch,
    title: '深度语义查重',
    description: '不仅对比文字，更能理解文档背后的逻辑，识别改写与洗稿行为。',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  {
    icon: Shield,
    title: '私有化 Dify 驱动',
    description: '通过内网 Dify 工作流编排，确保每一项评分标准都得到精确执行。',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: Zap,
    title: '全自动化报告',
    description: '一键生成 PDF 评审报告，涵盖评分细则、改进建议与最终等级。',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  {
    icon: BarChart3,
    title: '多维度评估',
    description: '支持自定义评分维度与权重，适应不同竞赛场景需求。',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  {
    icon: Lock,
    title: '企业级安全',
    description: 'JWT 身份验证，所有数据传输加密，确保文档内容安全。',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: Rocket,
    title: '实时处理',
    description: '异步任务队列，支持大规模并发评审，实时查看处理进度。',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { requireAuth } = useRequireAuth();

  const handleStartJudge = () => {
    // 需要登录，未登录会跳转登录页
    requireAuth(() => navigate('/judge'));
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-slate-900 to-purple-900/20" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />

        <div className="relative container mx-auto px-4 pt-20 pb-32">
          {/* Header */}
          <header className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-cyan-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold text-white">灵审云评</span>
            </div>

            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <>
                  <span className="text-slate-400 text-sm hidden sm:inline">
                    欢迎，{user?.email?.split('@')[0]}
                  </span>

                  {(user?.role === 'admin' || user?.role === 'owner') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/admin/contests')}
                      className="text-slate-400 hover:text-black"
                    >
                      管理后台
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/history')}
                    className="text-slate-400 hover:text-black"
                  >
                    测评历史
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/judge')}
                    className="border-cyan-600 bg-cyan-500 text-cyan-50 hover:bg-cyan-950 hover:text-white/70"
                  >
                    开始评审
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/login')}
                  className="border-cyan-600 text-cyan-400 hover:bg-cyan-950"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  登录
                </Button>
              )}
            </div>
          </header>

          {/* Hero Content */}
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              AI智能评审
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
                工作站
              </span>
            </h1>

            <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              基于 Dify 大语言模型工作流，为学术与政企竞赛提供
              <span className="text-slate-200">公正、深度、自动化</span>的文档评审解决方案。
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* 主按钮：开始评审 */}
              <Button
                size="lg"
                onClick={handleStartJudge}
                className="h-14 px-8 text-lg bg-cyan-600 hover:bg-cyan-700 text-white group"
              >
                {isAuthenticated ? '开始评审' : '登录并开始评审'}
                <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>

              {/* 次要按钮：竞赛列表 */}
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate('/contests')}
                className="h-14 px-8 text-lg border-slate-700 text-slate-700 hover:bg-slate-400"
              >
                查看竞赛列表
              </Button>

              {/* 新增次要按钮：证书鉴伪入口 */}
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate('/check-certificate')}
                className="h-14 px-8 text-lg border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/90 hover:border-emerald-500 transition-all"
              >
                <ShieldCheck className="w-5 h-5 mr-2" />
                证书鉴伪核验
              </Button>
            </div>

            {/* 未登录提示 */}
            {!isAuthenticated && (
              <p className="mt-6 text-sm text-slate-500">
                已有账号？<button onClick={() => navigate('/login')} className="text-cyan-400 hover:underline">立即登录</button>
                或直接 <button onClick={() => navigate('/contests')} className="text-cyan-400 hover:underline">查看竞赛列表</button>
              </p>
            )}
          </div>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">核心能力</h2>
          <p className="text-slate-400">全方位的智能评审解决方案</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all duration-300 group cursor-pointer"
              onClick={() => index === 0 && handleStartJudge()} // 点击第一个卡片也触发登录检查
            >
              <CardContent className="p-6">
                <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center border-t border-slate-800">
        <p className="mt-2 text-[9px] text-slate-500">
          鄂ICP备2026012182号-1
        </p>
      </footer>
    </div>
  );
}
