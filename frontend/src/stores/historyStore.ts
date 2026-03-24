import { create } from 'zustand';
import type { HistoryRecord } from '@/types';

interface HistoryState {
  history: HistoryRecord[];
  addRecord: (record: HistoryRecord) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  (set) => ({
    history: [],
    addRecord: (record) =>
      set((state) => ({
        history: [record, ...state.history],
      })),
    clearHistory: () => set({ history: [] }),
  })
);