import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp, FolderTree, Edit2, Check, X, Upload, ImageIcon, Calendar, Globe, EyeOff } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { Contest, Track, ApiError } from '@/types';

// 赛道编辑组件
function TrackEditor({
  contestId,
  track,
  onCancel,
  onSuccess,
}: {
  contestId: string;
  track?: Track;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Track>>({
    id: track?.id || '',
    name: track?.name || '',
    description: track?.description || '',
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Track>) => adminApi.createTrack(contestId, data as Track),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      onSuccess();
    },
    onError: (err: ApiError) => {
      alert('创建失败: ' + (err.response?.data?.detail || err.message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Track) => adminApi.updateTrack(contestId, data.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      onSuccess();
    },
    onError: (err: ApiError) => {
      alert('更新失败: ' + (err.response?.data?.detail || err.message));
    },
  });

  const handleSubmit = () => {
    if (!form.name) {
      alert('请输入赛道名称');
      return;
    }
    if (track) {
      updateMutation.mutate({ ...track, ...form } as Track);
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="bg-muted/50 p-4 rounded-lg space-y-3">
      {!track && (
        <Input
          value={form.id}
          onChange={(e) => setForm({ ...form, id: e.target.value })}
          placeholder="赛道 ID（可选，留空自动生成）"
          className="text-sm"
        />
      )}
      <Input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="赛道名称"
        className="text-sm"
      />
      <Textarea
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="赛道描述（可选）"
        className="text-sm min-h-[60px]"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
          {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          <Check className="mr-1 h-3 w-3" />
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" />
          取消
        </Button>
      </div>
    </div>
  );
}

// Logo上传组件
function LogoUploader({
  contestId,
  currentLogo,
  onSuccess,
}: {
  contestId: string;
  currentLogo?: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadContestLogo(contestId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      onSuccess();
    },
    onError: (err: ApiError) => {
      alert('上传失败: ' + (err.response?.data?.detail || err.message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteContestLogo(contestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
    },
    onError: () => {
      alert('删除失败');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }

    // 验证文件大小 (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB');
      return;
    }

    uploadMutation.mutate(file);
  };

  return (
    <div className="flex items-center gap-3">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      
      {currentLogo ? (
        <div className="relative group">
          <img
            src={currentLogo}
            alt="竞赛logo"
            className="w-12 h-12 rounded-lg object-cover border"
          />
          <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-white"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              <Upload className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-white hover:text-red-400"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-12 w-12 p-0 border-dashed"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

// 格式化日期时间为本地格式
function formatDateTime(isoString?: string): string {
  if (!isoString) return '未设置';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// 获取竞赛状态显示（根据时间自动计算）
function getStatusDisplay(start_time?: string, end_time?: string): { text: string; color: string } {
  const now = new Date();
  const start = start_time ? new Date(start_time) : null;
  const end = end_time ? new Date(end_time) : null;
  
  if (start && end) {
    if (now < start) {
      return { text: '即将开始', color: 'text-blue-600 bg-blue-100' };
    } else if (now >= start && now <= end) {
      return { text: '进行中', color: 'text-green-600 bg-green-100' };
    } else {
      return { text: '已结束', color: 'text-gray-600 bg-gray-100' };
    }
  }
  return { text: '时间未设置', color: 'text-gray-500 bg-gray-100' };
}

// 竞赛卡片组件
function ContestCard({
  contest,
  onDelete,
  isDeleting,
}: {
  contest: Contest;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTrack, setEditingTrack] = useState<string | null>(null);
  const [addingTrack, setAddingTrack] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [timeForm, setTimeForm] = useState({
    start_time: contest.start_time ? contest.start_time.slice(0, 16) : '',
    end_time: contest.end_time ? contest.end_time.slice(0, 16) : '',
  });
  const queryClient = useQueryClient();

  // 发布状态切换 mutation
  const publishMutation = useMutation({
    mutationFn: ({ contestId, isPublished }: { contestId: string; isPublished: boolean }) =>
      adminApi.publishContest(contestId, isPublished),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
    },
    onError: (err: ApiError) => {
      alert('更新发布状态失败: ' + (err.response?.data?.detail || err.message));
    },
  });

  // 更新时间 mutation
  const updateTimeMutation = useMutation({
    mutationFn: ({ contestId, startTime, endTime }: { contestId: string; startTime?: string; endTime?: string }) =>
      adminApi.updateContestTime(contestId, startTime, endTime),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      setEditingTime(false);
    },
    onError: (err: ApiError) => {
      alert('更新时间失败: ' + (err.response?.data?.detail || err.message));
    },
  });

  const handlePublishToggle = () => {
    publishMutation.mutate({ contestId: contest.id, isPublished: !contest.is_published });
  };

  const handleTimeSubmit = () => {
    // 转换为 ISO 格式
    const startTime = timeForm.start_time ? new Date(timeForm.start_time).toISOString() : undefined;
    const endTime = timeForm.end_time ? new Date(timeForm.end_time).toISOString() : undefined;
    updateTimeMutation.mutate({ contestId: contest.id, startTime, endTime });
  };

  const deleteTrackMutation = useMutation({
    mutationFn: ({ contestId, trackId }: { contestId: string; trackId: string }) =>
      adminApi.deleteTrack(contestId, trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
    },
    onError: (err: ApiError) => {
      alert('删除失败: ' + (err.response?.data?.detail || err.message));
    },
  });

  const handleDeleteTrack = (trackId: string) => {
    if (!confirm('确定要删除这个赛道吗？相关的评分规则也将被删除。')) return;
    deleteTrackMutation.mutate({ contestId: contest.id, trackId });
  };

  const tracks = contest.tracks || [];
  const statusDisplay = getStatusDisplay(contest.start_time, contest.end_time);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* 竞赛头部 */}
      <div
        className="flex items-center justify-between p-4 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          
          {/* Logo显示 */}
          {contest.logo ? (
            <img
              src={contest.logo}
              alt={contest.name}
              className="w-10 h-10 rounded-lg object-cover border"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border">
              <span className="text-lg font-bold text-primary">{contest.name.charAt(0)}</span>
            </div>
          )}
          
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{contest.name}</span>
              {/* 发布状态标签 */}
              <span className={`text-xs px-2 py-0.5 rounded-full ${contest.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {contest.is_published ? '已上线' : '未上线'}
              </span>
              {/* 竞赛状态标签 */}
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusDisplay.color}`}>
                {statusDisplay.text}
              </span>
            </div>
            <div className="text-xs text-muted-foreground font-mono">ID: {contest.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Logo上传按钮（仅在展开时显示） */}
          {expanded && (
            <LogoUploader
              contestId={contest.id}
              currentLogo={contest.logo}
              onSuccess={() => {}}
            />
          )}
          <span className="text-xs text-muted-foreground">
            {tracks.length} 个赛道
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(contest.id);
            }}
            disabled={isDeleting}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 赛道列表 */}
      {expanded && (
        <div className="border-t bg-muted/20">
          {/* 竞赛设置区域 */}
          <div className="p-3 border-b bg-muted/30 space-y-3">
            {/* Logo上传 */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground w-20">竞赛Logo:</span>
              <LogoUploader
                contestId={contest.id}
                currentLogo={contest.logo}
                onSuccess={() => {}}
              />
              <span className="text-xs text-muted-foreground">支持 JPG/PNG/GIF/WebP, 最大 2MB</span>
            </div>

            {/* 上线/下线控制 */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground w-20">发布状态:</span>
              <div className="flex items-center gap-2">
                <Switch
                  id={`publish-${contest.id}`}
                  checked={contest.is_published || false}
                  onCheckedChange={handlePublishToggle}
                  disabled={publishMutation.isPending}
                />
                <Label htmlFor={`publish-${contest.id}`} className="flex items-center gap-1 cursor-pointer">
                  {publishMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : contest.is_published ? (
                    <>
                      <Globe className="w-3 h-3 text-green-600" />
                      <span className="text-green-600">已上线</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500">未上线</span>
                    </>
                  )}
                </Label>
              </div>
            </div>

            {/* 时间设置 */}
            <div className="flex items-start gap-3">
              <span className="text-sm text-muted-foreground w-20 pt-2">竞赛时间:</span>
              <div className="flex-1 space-y-2">
                {editingTime ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14">开始:</span>
                      <Input
                        type="datetime-local"
                        value={timeForm.start_time}
                        onChange={(e) => setTimeForm({ ...timeForm, start_time: e.target.value })}
                        className="text-sm h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14">结束:</span>
                      <Input
                        type="datetime-local"
                        value={timeForm.end_time}
                        onChange={(e) => setTimeForm({ ...timeForm, end_time: e.target.value })}
                        className="text-sm h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={handleTimeSubmit}
                        disabled={updateTimeMutation.isPending}
                      >
                        {updateTimeMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        <Check className="mr-1 h-3 w-3" />
                        保存
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingTime(false);
                          setTimeForm({
                            start_time: contest.start_time ? contest.start_time.slice(0, 16) : '',
                            end_time: contest.end_time ? contest.end_time.slice(0, 16) : '',
                          });
                        }}
                      >
                        <X className="mr-1 h-3 w-3" />
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      <span>
                        {contest.start_time || contest.end_time ? (
                          <>
                            {formatDateTime(contest.start_time)} - {formatDateTime(contest.end_time)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">未设置时间</span>
                        )}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      onClick={() => setEditingTime(true)}
                    >
                      <Edit2 className="w-3 h-3 mr-1" />
                      编辑
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {tracks.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              暂无赛道，请添加
            </div>
          ) : (
            <div className="divide-y">
              {tracks.map((track) => (
                <div key={track.id} className="p-3 hover:bg-muted/30">
                  {editingTrack === track.id ? (
                    <TrackEditor
                      contestId={contest.id}
                      track={track}
                      onCancel={() => setEditingTrack(null)}
                      onSuccess={() => setEditingTrack(null)}
                    />
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FolderTree className="w-4 h-4 text-primary" />
                        <div>
                          <div className="text-sm font-medium">{track.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">ID: {track.id}</div>
                          {track.description && (
                            <div className="text-xs text-muted-foreground mt-1">{track.description}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditingTrack(track.id)}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteTrack(track.id)}
                          disabled={deleteTrackMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 添加赛道 */}
          {addingTrack ? (
            <div className="p-3 border-t">
              <TrackEditor
                contestId={contest.id}
                onCancel={() => setAddingTrack(false)}
                onSuccess={() => setAddingTrack(false)}
              />
            </div>
          ) : (
            <div className="p-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed"
                onClick={() => setAddingTrack(true)}
              >
                <Plus className="w-3 h-3 mr-1" />
                添加赛道
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ContestManagement() {
  const queryClient = useQueryClient();
  const [newContest, setNewContest] = useState({ name: '', description: '' });

  const { data: contests = [], isLoading } = useQuery({
    queryKey: ['contests'],
    queryFn: adminApi.getContests,
  });

  const createMutation = useMutation({
    mutationFn: adminApi.createContest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      setNewContest({ name: '', description: '' });
    },
    onError: (err: ApiError) => {
      alert('创建失败: ' + (err.response?.data?.detail || err.message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: adminApi.deleteContest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
    },
    onError: () => {
      alert('删除失败');
    },
  });

  const handleCreate = () => {
    if (!newContest.name) return;
    createMutation.mutate({
      name: newContest.name,
      description: newContest.description,
      status: 'upcoming',
      tracks: [],
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm(`确定要删除竞赛 ${id} 吗？这将删除该竞赛下的所有赛道和评分规则。`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">竞赛列表</h2>

      {/* Create Contest Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-5 h-5" />
            新建竞赛
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={newContest.name}
            onChange={(e) => setNewContest({ ...newContest, name: e.target.value })}
            placeholder="竞赛显示名称"
          />
          <Textarea
            value={newContest.description}
            onChange={(e) => setNewContest({ ...newContest, description: e.target.value })}
            placeholder="竞赛描述（可选）"
            className="min-h-[80px]"
          />
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !newContest.name}
          >
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {createMutation.isPending ? '创建中' : '立即创建'}
          </Button>
        </CardContent>
      </Card>

      {/* Contest List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">已有竞赛</h3>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : contests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            暂无竞赛数据
          </div>
        ) : (
          <div className="space-y-3">
            {(contests as Contest[]).map((contest) => (
              <ContestCard
                key={contest.id}
                contest={contest}
                onDelete={handleDelete}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
