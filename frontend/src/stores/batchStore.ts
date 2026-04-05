import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BatchFile {
  id: string; // 唯一标识，通常是文件名或随机ID
  file?: File; // 仅在上传阶段存在
  filename: string;
  status: 'idle' | 'uploading' | 'submitting' | 'processing' | 'success' | 'failed' | 'error';
  progress: number;
  error?: string;
  workflowRunId?: string;
  uploadedName?: string;
}

interface BatchState {
  currentBatch: BatchFile[];
  selectedContestId: string | null;
  selectedTrackId: string | null;
  isProcessing: boolean;

  // Actions
  setContestId: (id: string | null) => void;
  setTrackId: (id: string | null) => void;
  setFiles: (files: BatchFile[]) => void;
  updateFileStatus: (id: string, updates: Partial<BatchFile>) => void;
  setIsProcessing: (loading: boolean) => void;
  clearBatch: () => void;
}

export const useBatchStore = create<BatchState>()(
  persist(
    (set) => ({
      currentBatch: [],
      selectedContestId: null,
      selectedTrackId: null,
      isProcessing: false,

      setContestId: (id) => set({ selectedContestId: id, selectedTrackId: null }),
      setTrackId: (id) => set({ selectedTrackId: id }),
      setFiles: (files) => set({ currentBatch: files }),
      updateFileStatus: (id, updates) => set((state) => ({
        currentBatch: state.currentBatch.map(f => f.id === id ? { ...f, ...updates } : f)
      })),
      setIsProcessing: (loading) => set({ isProcessing: loading }),
      clearBatch: () => set({ currentBatch: [], isProcessing: false }),
    }),
    {
      name: 'aijudge-batch-state',
      partialize: (state) => ({
        currentBatch: state.currentBatch.map(({ file, ...rest }) => rest),
        selectedContestId: state.selectedContestId,
        selectedTrackId: state.selectedTrackId,
        isProcessing: state.isProcessing,
      }),
    }
  )
);
