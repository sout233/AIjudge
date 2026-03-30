import client from './client';
import type { Contest, Track, Announcement, RuleConfig } from '@/types';

export const adminApi = {
  // ========== 竞赛管理 ==========
  getContests: (): Promise<Contest[]> => client.get('/admin/contests'),

  createContest: (
    data: Omit<Contest, 'id' | 'description' | 'tracks'> & { description: string; tracks?: Track[] }
  ): Promise<void> => client.post('/admin/contests', data),

  deleteContest: (contestId: string): Promise<void> =>
    client.delete(`/admin/contests/${contestId}`),

  // ========== 竞赛发布状态管理 ==========
  publishContest: (contestId: string, isPublished: boolean): Promise<{ success: boolean; is_published: boolean }> =>
    client.post(`/admin/contests/${contestId}/publish?is_published=${isPublished}`),

  // ========== 竞赛时间设置 ==========
  updateContestTime: (contestId: string, startTime?: string, endTime?: string): Promise<{
    success: boolean;
    start_time?: string;
    end_time?: string;
    status?: string;
  }> => {
    const params = new URLSearchParams();
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    return client.post(`/admin/contests/${contestId}/time?${params.toString()}`);
  },

  // ========== Logo 管理 ==========
  uploadContestLogo: (contestId: string, file: File): Promise<{ success: boolean; logo: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post(`/admin/contests/${contestId}/logo`, formData);
  },

  deleteContestLogo: (contestId: string): Promise<void> =>
    client.delete(`/admin/contests/${contestId}/logo`),

  // ========== 赛道管理 ==========
  getTracks: (contestId: string): Promise<Track[]> =>
    client.get(`/admin/contests/${contestId}/tracks`),

  createTrack: (contestId: string, track: Omit<Track, 'id'> & { id?: string }): Promise<{ track: Track }> =>
    client.post(`/admin/contests/${contestId}/tracks`, track),

  updateTrack: (contestId: string, trackId: string, track: Track): Promise<void> =>
    client.put(`/admin/contests/${contestId}/tracks/${trackId}`, track),

  deleteTrack: (contestId: string, trackId: string): Promise<void> =>
    client.delete(`/admin/contests/${contestId}/tracks/${trackId}`),

  // ========== 公告管理 ==========
  getAnnouncement: (contestId: string): Promise<Announcement> =>
    client.get(`/admin/announcement/${contestId}`),

  saveAnnouncement: (contestId: string, content: string): Promise<void> => {
    const formData = new FormData();
    formData.append('content', content);
    return client.post(`/admin/announcement/${contestId}`, formData);
  },

  // ========== 规则管理（改为关联赛道） ==========
  getRule: (trackId: string): Promise<RuleConfig> =>
    client.get(`/admin/rule/${trackId}`),

  saveRule: (trackId: string, fileOrContent: File | string): Promise<void> => {
    const formData = new FormData();
    if (fileOrContent instanceof File) {
      formData.append('file', fileOrContent);
    } else {
      formData.append('content', fileOrContent);
    }
    return client.post(`/admin/rule/${trackId}`, formData);
  },

  processScoringStandard: (trackId: string, file: File): Promise<RuleConfig> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.put(`/admin/rule/${trackId}`, formData);
  },
};
