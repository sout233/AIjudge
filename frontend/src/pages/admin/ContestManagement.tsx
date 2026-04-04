import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, ImagePlus, X, Settings2, FolderTree, Pencil, Calendar, Info } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ContestLogo } from '@/components/ContestLogo';
import type { Contest, Track } from '@/types';

export function ContestManagement() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [newContest, setNewContest] = useState({ id: '', name: '', logo_url: '' });

  // 赛道管理相关状态
  const [editingTracksContest, setEditingTracksContest] = useState<Contest | null>(null);
  const [newTrack, setNewTrack] = useState({ id: '', name: '' });

  // 竞赛编辑相关状态
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingContest, setEditingContest] = useState<Contest | null>(null);

  const { data: contests = [], isLoading } = useQuery({
    queryKey: ['contests'],
    queryFn: adminApi.getContests,
  });

  const createMutation = useMutation({
    mutationFn: adminApi.createContest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      setNewContest({ id: '', name: '', logo_url: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: adminApi.deleteContest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contests'] }),
  });

  // 更新竞赛（用于保存赛道）
  const updateMutation = useMutation({
    mutationFn: (contest: Contest) => {
      console.log('Updating contest:', contest);
      return adminApi.updateContest(contest.id, contest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      // 更新当前正在编辑的赛道列表对象，以反映最新状态
      if (editingTracksContest) {
        const updated = contests.find(c => c.id === editingTracksContest.id);
        if (updated) setEditingTracksContest(updated);
      }
    },
    onError: (err) => {
      console.error('Update failed:', err);
      alert('保存失败，请检查控制台。');
    }
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewContest(prev => ({ ...prev, logo_url: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = () => {
    if (!newContest.name) return;
    createMutation.mutate({
      id: newContest.id || '', // 传空字符串，由后端生成
      name: newContest.name,
      description: '',
      logo_url: newContest.logo_url,
      status: 'active',
      tracks: []
    });
  };

  // 添加赛道
  const handleAddTrack = () => {
    if (!editingTracksContest || !newTrack.name) return;
    const trackId = newTrack.id || Math.random().toString(36).substring(2, 10);
    const updatedContest = {
      ...editingTracksContest,
      tracks: [...(editingTracksContest.tracks || []), { id: trackId, name: newTrack.name }]
    };
    updateMutation.mutate(updatedContest);
    setNewTrack({ id: '', name: '' });
  };

  // 删除赛道
  const handleDeleteTrack = (trackId: string) => {
    if (!editingTracksContest) return;
    const updatedContest = {
      ...editingTracksContest,
      tracks: (editingTracksContest.tracks || []).filter(t => t.id !== trackId)
    };
    updateMutation.mutate(updatedContest);
  };

  // 处理竞赛编辑保存
  const handleEditSave = () => {
    if (!editingContest) return;
    updateMutation.mutate(editingContest, {
      onSuccess: () => setIsEditDialogOpen(false)
    });
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingContest) {
      const reader = new FileReader();
      reader.onloadend = () => setEditingContest(prev => prev ? ({ ...prev, logo_url: reader.result as string }) : null);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">竞赛与赛道管理</h2>

      {/* Create Contest */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Plus className="w-5 h-5 text-primary" />新建竞赛</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-6">
            <div onClick={() => fileInputRef.current?.click()} className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 hover:border-primary flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-slate-50 transition-all group">
              {newContest.logo_url ? <img src={newContest.logo_url} className="w-full h-full object-cover" /> : <><ImagePlus className="w-8 h-8 text-slate-400" /><span className="text-[10px] font-bold mt-1">上传图标</span></>}
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
            <div className="flex-1 space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <Input value={newContest.name} onChange={(e) => setNewContest({ ...newContest, name: e.target.value })} placeholder="竞赛显示名称" className="w-full" />
              </div>
              <div className="flex justify-end"><Button onClick={handleCreate} disabled={createMutation.isPending || !newContest.name}>确认创建</Button></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List Table */}
      <Card>
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[80px]">图标</TableHead>
              <TableHead>竞赛名称</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>赛道数量</TableHead>
              <TableHead className="text-right">管理</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contests.map((c: Contest) => (
              <TableRow key={c.id}>
                <TableCell><ContestLogo url={c.logo_url} name={c.name} id={c.id} size="sm" /></TableCell>
                <TableCell><div className="font-bold">{c.name}</div><div className="text-[10px] text-slate-400 font-mono">{c.id}</div></TableCell>
                <TableCell>
                  <Badge variant={c.status === 'active' || c.status === '进行中' ? 'default' : 'secondary'}>
                    {c.status || '进行中'}
                  </Badge>
                </TableCell>
                <TableCell><Badge variant="outline" className="font-mono">{c.tracks?.length || 0}</Badge></TableCell>
                <TableCell className="text-right space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setEditingContest(c);
                      setIsEditDialogOpen(true);
                    }}
                    className="text-slate-600 border-slate-200 hover:bg-slate-50"
                  >
                    <Pencil className="w-4 h-4 mr-1" /> 编辑
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingTracksContest(c)} className="text-primary border-primary/20 hover:bg-primary/10">
                    <FolderTree className="w-4 h-4 mr-1" /> 赛道
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { if(confirm('确定要删除该竞赛吗？这将删除所有相关的规则和公告。')) deleteMutation.mutate(c.id); }} className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Contest Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              修改竞赛信息
            </DialogTitle>
            <DialogDescription>更新竞赛的图标、名称、时间及状态等核心信息。</DialogDescription>
          </DialogHeader>

          {editingContest && (
            <div className="grid gap-6 py-4">
              <div className="flex items-center gap-6">
                <div 
                  onClick={() => editFileInputRef.current?.click()} 
                  className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 hover:border-primary flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-slate-50 transition-all"
                >
                  {editingContest.logo_url ? (
                    <img src={editingContest.logo_url} className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <input type="file" ref={editFileInputRef} onChange={handleEditImageChange} className="hidden" accept="image/*" />
                <div className="flex-1 space-y-2">
                  <Label>竞赛名称</Label>
                  <Input 
                    value={editingContest.name} 
                    onChange={e => setEditingContest({...editingContest, name: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Info className="w-3 h-3" /> 竞赛状态</Label>
                  <Select 
                    value={editingContest.status || '进行中'} 
                    onValueChange={v => setEditingContest({...editingContest, status: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">进行中 (Active)</SelectItem>
                      <SelectItem value="upcoming">即将开始 (Upcoming)</SelectItem>
                      <SelectItem value="finished">已结束 (Finished)</SelectItem>
                      <SelectItem value="archived">已存档 (Archived)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>竞赛分类</Label>
                  <Input 
                    value={editingContest.category || ''} 
                    onChange={e => setEditingContest({...editingContest, category: e.target.value})}
                    placeholder="如：学术竞赛、科技创新"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Calendar className="w-3 h-3" /> 开始时间</Label>
                  <Input 
                    type="date" 
                    value={editingContest.start_time || ''} 
                    onChange={e => setEditingContest({...editingContest, start_time: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Calendar className="w-3 h-3" /> 结束时间</Label>
                  <Input 
                    type="date" 
                    value={editingContest.end_time || ''} 
                    onChange={e => setEditingContest({...editingContest, end_time: e.target.value})} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>竞赛描述</Label>
                <Textarea 
                  value={editingContest.description || ''} 
                  onChange={e => setEditingContest({...editingContest, description: e.target.value})}
                  placeholder="简要介绍竞赛背景、目标与参与要求..."
                  className="min-h-[100px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending}>保存修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTracksContest} onOpenChange={(open) => !open && setEditingTracksContest(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black italic uppercase">
              <Settings2 className="w-6 h-6 text-primary" />
              赛道配置中心
            </DialogTitle>
            <DialogDescription>正在为【{editingTracksContest?.name}】配置评审赛道。每个赛道将对应一个独立的评分规则 ID。</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-3">
              <Input value={newTrack.name} onChange={e => setNewTrack({...newTrack, name: e.target.value})} placeholder="赛道名称 (前端显示)" className="flex-1" />
              <Button onClick={handleAddTrack} disabled={updateMutation.isPending || !newTrack.name} className="bg-primary shadow-lg">添加赛道</Button>
            </div>

            {/* Tracks List */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(editingTracksContest?.tracks || []).length === 0 ? (
                <div className="text-center py-10 text-slate-400 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-sm">尚未添加任何赛道，评审流程将无法在此竞赛下进行。</div>
              ) : (
                editingTracksContest?.tracks.map((track: Track) => (
                  <div key={track.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:shadow-md transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-mono text-[10px] text-slate-500 font-bold uppercase">{track.id.slice(0,2)}</div>
                      <div>
                        <p className="font-bold text-slate-900">{track.name}</p>
                        <p className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">Rule_Binding: {track.id}.json</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteTrack(track.id)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600 hover:bg-red-50">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
