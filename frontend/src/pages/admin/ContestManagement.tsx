import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Contest } from '@/types';

export function ContestManagement() {
  const queryClient = useQueryClient();
  const [newContest, setNewContest] = useState({ id: '', name: '' });

  const { data: contests = [], isLoading } = useQuery({
    queryKey: ['contests'],
    queryFn: adminApi.getContests,
  });

  const createMutation = useMutation({
    mutationFn: adminApi.createContest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      setNewContest({ id: '', name: '' });
    },
    onError: (err: { response?: { data?: { detail?: string } }; message: string }) => {
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
    if (!newContest.id || !newContest.name) return;
    createMutation.mutate({
      id: newContest.id,
      name: newContest.name,
      description: '',
      status: 'upcoming', // 添加这一行
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm(`确定要删除竞赛 ${id} 吗?`)) return;
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
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <Input
              value={newContest.id}
              onChange={(e) => setNewContest({ ...newContest, id: e.target.value })}
              placeholder="竞赛 ID (例如: contest_001)"
              className="md:w-1/3"
            />
            <Input
              value={newContest.name}
              onChange={(e) => setNewContest({ ...newContest, name: e.target.value })}
              placeholder="竞赛显示名称"
              className="md:w-1/3"
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newContest.id || !newContest.name}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createMutation.isPending ? '创建中' : '立即创建'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Contest List */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : contests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  暂无竞赛数据
                </TableCell>
              </TableRow>
            ) : (
              contests.map((contest: Contest) => (
                <TableRow key={contest.id}>
                  <TableCell className="font-mono text-sm">{contest.id}</TableCell>
                  <TableCell className="font-medium">{contest.name}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(contest.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}