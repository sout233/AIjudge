import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Info, Loader2, Monitor, Code2, Trash2, Image as ImageIcon } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RichEditor, SourceEditor, RichContent, MarkdownPreview } from '@/components/ui/rich-editor';
import { extractTextFromHtml, countImages, getContentSize } from '@/components/ui/rich-editor';
import type { Contest } from '@/types';

export function AnnouncementManagement() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>('');
  const [content, setContent] = useState('');
  const [editMode, setEditMode] = useState<'visual' | 'source' | 'markdown'>('visual');

  const { data: contests = [] } = useQuery({
    queryKey: ['contests'],
    queryFn: adminApi.getContests,
  });

  const { data: announcementData, isLoading: loadingAnnouncement } = useQuery({
    queryKey: ['announcement', selectedId],
    queryFn: () => adminApi.getAnnouncement(selectedId),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (announcementData) {
      setContent(announcementData.content || '');    }
  }, [announcementData]);

  const saveMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      adminApi.saveAnnouncement(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcement', selectedId] });
      alert('公告保存成功');
    },
    onError: () => {
      alert('保存失败');
    },
  });

  const handleSave = () => {
    if (!selectedId) return;
    saveMutation.mutate({ id: selectedId, content });
  };

  const handleClear = () => {
    if (confirm('确定要清空当前内容吗？')) {
      setContent('');
    }
  };

  const selectedName = contests.find((c: Contest) => c.id === selectedId)?.name || '';

  // 统计信息
  const textLength = extractTextFromHtml(content).length;
  const imageCount = countImages(content);
  const sizeKB = getContentSize(content).toFixed(1);

  return (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h2 className="text-2xl font-bold">公告配置</h2>
        
        <div className="flex items-center gap-3">
          {/* 编辑模式切换 */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setEditMode('visual')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                editMode === 'visual' 
                  ? 'bg-white shadow-sm text-cyan-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="w-4 h-4" />
              可视化
            </button>
            <button
              onClick={() => setEditMode('source')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                editMode === 'source' 
                  ? 'bg-white shadow-sm text-cyan-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Code2 className="w-4 h-4" />
              源码
            </button>
            <button
              onClick={() => setEditMode('markdown')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                editMode === 'markdown' 
                  ? 'bg-white shadow-sm text-cyan-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Code2 className="w-4 h-4" />
              Markdown
            </button>
          </div>
        </div>
      </div>

      {/* 竞赛选择 */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="w-64">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="请选择一个竞赛..." />
            </SelectTrigger>
            <SelectContent>
              {contests.map((c: Contest) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {selectedId && (
          <span className="text-sm text-slate-500">
            当前编辑：<span className="font-medium text-slate-900">{selectedName}</span>
          </span>
        )}
      </div>

      {selectedId ? (
        <Card className="flex-1 flex flex-col min-h-0">
          {loadingAnnouncement ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
            </div>
          ) : (
            <>
              {/* 工具栏 */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50/50">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>纯文本：{textLength} 字</span>
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    {imageCount} 张图片
                  </span>
                  <span>大小：{sizeKB} KB</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleClear}
                    disabled={!content || saveMutation.isPending}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    清空
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="bg-cyan-600 hover:bg-cyan-700"
                  >
                    {saveMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <Save className="w-4 h-4 mr-2" />
                    保存
                  </Button>
                </div>
              </div>

              {/* 左右分栏编辑区 */}
              <CardContent className="flex-1 p-0 min-h-0">
                <div className="h-full flex">
                  {/* 左侧：编辑器 */}
                  <div className="flex-1 border-r min-h-0">
                    {editMode === 'visual' ? (
                      <RichEditor
                        value={content}
                        onChange={setContent}
                        placeholder="在此输入公告内容..."
                        className="h-full"
                      />
                    ) : editMode === 'source' ? (
                      <SourceEditor
                        value={content}
                        onChange={setContent}
                        className="h-full"
                      />
                    ) : (
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b text-xs text-slate-500">
                          <span>Markdown 编辑器</span>
                        </div>
                        <textarea
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                          className="flex-1 w-full p-4 font-mono text-sm bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                          spellCheck={false}
                          placeholder="# 标题\n\n内容..."
                        />
                      </div>
                    )}
                  </div>

                  {/* 右侧：实时预览 */}
                  <div className="flex-1 min-h-0 flex flex-col bg-slate-50">
                    <div className="px-4 py-2 bg-slate-100 border-b text-xs font-medium text-slate-600 flex items-center gap-2">
                      <Monitor className="w-3 h-3" />
                      {editMode === 'markdown' ? 'Markdown 预览' : '实时预览'}
                    </div>
                    <div className="flex-1 overflow-auto p-6">
                      <div className="bg-white rounded-lg shadow-sm min-h-full p-6">
                        {editMode === 'markdown' ? (
                          <MarkdownPreview content={content} />
                        ) : (
                          <RichContent content={content} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
          <Info className="w-16 h-16 text-slate-300 mb-4" />
          <p className="text-slate-500 text-lg">请选择一个竞赛以编辑公告</p>
          <p className="text-sm text-slate-400 mt-2">
            支持富文本格式，可插入图片、链接、表格等
          </p>
        </div>
      )}
    </div>
  );
}