import { useCallback, useEffect, useState, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  maxImageSize?: number;
}

const formats = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'color', 'background',
  'list', 'bullet',
  'align',
  'link', 'image'
];

export function RichEditor({ 
  value, 
  onChange, 
  placeholder = '请输入内容...',
  className,
  readOnly = false,
  maxImageSize = 5
}: RichEditorProps) {
  const [mounted, setMounted] = useState(false);
  const quillRef = useRef<ReactQuill>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // 图片转 Base64 处理
  const handleImageUpload = useCallback(() => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      if (file.size > maxImageSize * 1024 * 1024) {
        alert(`图片大小不能超过 ${maxImageSize}MB`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        const quill = quillRef.current?.getEditor();
        if (quill) {
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'image', base64);
          quill.setSelection(range.index + 1);
        }
      };
      reader.readAsDataURL(file);
    };
  }, [maxImageSize]);

  const modules = {
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['link', 'image'],
        ['clean']
      ],
      handlers: {
        image: handleImageUpload
      }
    }
  };

  // 使用 ref 避免重复渲染导致的收起问题
  const handleChange = useCallback((content: string) => {
    onChange(content);
  }, [onChange]);

  // 粘贴事件处理
  useEffect(() => {
    if (!mounted || !quillRef.current) return;

    const editor = quillRef.current.getEditor();
    const container = editor.container;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          if (!blob) continue;

          if (blob.size > maxImageSize * 1024 * 1024) {
            alert(`图片大小不能超过 ${maxImageSize}MB`);
            continue;
          }

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            const range = editor.getSelection(true);
            editor.insertEmbed(range.index, 'image', base64);
            editor.setSelection(range.index + 1);
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };

    container.addEventListener('paste', handlePaste);
    return () => container.removeEventListener('paste', handlePaste);
  }, [mounted, maxImageSize]);

  if (!mounted) {
    return (
      <div className={cn(
        "min-h-[400px] border rounded-md bg-slate-50 animate-pulse",
        className
      )} />
    );
  }

  return (
    <div className={cn("rich-editor h-full flex flex-col", className)}>
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={handleChange}
        modules={readOnly ? { toolbar: false } : modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
        className="bg-white flex-1 flex flex-col"
      />
    </div>
  );
}

// 源码编辑器组件
interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SourceEditor({ value, onChange, className }: SourceEditorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // 格式化 HTML（简单的缩进）
  const formatHtml = () => {
    try {
      // 移除多余空格，基本格式化
      const formatted = value
        .replace(/></g, '>\n<')
        .replace(/\n\s*\n/g, '\n');
      onChange(formatted);
    } catch {
      // 忽略格式错误
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b text-xs text-slate-500">
        <span>HTML 源码</span>
        <button 
          onClick={formatHtml}
          className="hover:text-cyan-600 transition-colors"
        >
          格式化
        </button>
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        className="flex-1 w-full p-4 font-mono text-sm bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        spellCheck={false}
        placeholder="<p>输入 HTML 代码...</p>"
      />
    </div>
  );
}

// 预览组件
export function RichContent({ 
  content, 
  className 
}: { 
  content: string; 
  className?: string;
}) {
  return (
    <div 
      className={cn(
        "prose prose-slate max-w-none ql-snow h-full overflow-auto",
        className
      )}
    >
      <div 
        className="ql-editor min-h-full"
        dangerouslySetInnerHTML={{ __html: content || '<p><br></p>' }}
      />
    </div>
  );
}

// Markdown 预览组件

export function MarkdownPreview({ 
  content, 
  className 
}: { 
  content: string; 
  className?: string;
}) {
  return (
    <div 
      className={cn(
        "prose prose-slate max-w-none h-full overflow-auto",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
      >
        {content || '\n'}
      </ReactMarkdown>
    </div>
  );
}

// 工具函数
export function extractTextFromHtml(html: string): string {
  if (typeof document === 'undefined') return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export function countImages(html: string): number {
  if (typeof document === 'undefined') return 0;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.querySelectorAll('img').length;
}

export function getContentSize(html: string): number {
  // 估算存储大小（KB）
  return new Blob([html]).size / 1024;
}