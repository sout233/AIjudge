import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { judgeApi } from '@/api/judge';
import type { JudgeResult, JudgeStatusResponse, MultiJudgeResult } from '@/types';

const STATUS_MAP: Record<string, string> = {
  pending: '等待',
  running: '分析中',
  succeeded: '已完成',
  success: '完成',
  failed: '失败',
  error: '错误',
};

const parseResult = (data: JudgeStatusResponse): JudgeResult | MultiJudgeResult | null => {
  try {
    const deepOutput = data?.workflow_data?.workflow_data?.data?.outputs?.text;
    if (deepOutput) {
      const parsed = typeof deepOutput === 'string' ? JSON.parse(deepOutput) : deepOutput;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const parseProgressText = (data: JudgeStatusResponse): string => {
  let newLog = '';
  if (data.progress) newLog = data.progress;
  else if (Array.isArray(data.messages)) {
    newLog = data.messages.map((m) => `> ${m.text}`).join('\n');
  } else if (Array.isArray(data.workflow_data?.messages)) {
    newLog = data.workflow_data.messages.map((m) => `> ${m.text}`).join('\n');
  }

  if (newLog.includes("{'text':")) {
    try {
      const cleaned = newLog.replace(/'/g, '"');
      const obj = JSON.parse(cleaned);
      if (obj.text) newLog = obj.text;
    } catch {
      const match = newLog.match(/'text':\s*'([^']*)'/);
      if (match) newLog = match[1];
    }
  }

  const deepError = data?.workflow_data?.workflow_data?.data?.error;
  if (deepError) {
    newLog += `\n[ERROR]: ${deepError}`;
  }

  return newLog;
};

export function useJudgePolling(workflowRunId: string | undefined) {
  const queryClient = useQueryClient();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const query = useQuery({
    queryKey: ['judge', workflowRunId],
    queryFn: () => judgeApi.getStatus(workflowRunId!),
    enabled: !!workflowRunId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      const status = data.status;
      if (['succeeded', 'success', 'failed', 'error'].includes(status)) {
        return false;
      }
      return 2000;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const result = query.data ? parseResult(query.data) : null;
  const progressText = query.data ? parseProgressText(query.data) : '';
  const status = query.data?.status || 'pending';
  const statusText = STATUS_MAP[status] || status.toUpperCase();

  // Manual polling fallback if refetchInterval doesn't work as expected
  useEffect(() => {
    if (!workflowRunId) return;
    
    if (['succeeded', 'success', 'failed', 'error'].includes(status)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['judge', workflowRunId] });
    }, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [workflowRunId, status, queryClient]);

  return {
    status,
    statusText,
    progressText,
    result,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
