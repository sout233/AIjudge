import client from './client';
import type { Contest, Announcement, RuleConfig } from '@/types';

export const adminApi = {
  getContests: (): Promise<Contest[]> => 
    client.get('/admin/contests'),
  
  createContest: (data: Omit<Contest, 'description'> & { description: string }): Promise<void> => 
    client.post('/admin/contests', data),

  updateContest: (contestId: string, data: Contest): Promise<void> =>
    client.post(`/admin/contests/${contestId}`, data),
  
  deleteContest: (contestId: string): Promise<void> => 
    client.delete(`/admin/contests/${contestId}`),

  getAnnouncement: (contestId: string): Promise<Announcement> => 
    client.get(`/admin/announcement/${contestId}`),
  
  saveAnnouncement: (contestId: string, content: string): Promise<void> => {
    const formData = new FormData();
    formData.append('content', content);
    return client.post(`/admin/announcement/${contestId}`, formData);
  },

  getRule: (contestId: string): Promise<RuleConfig> => 
    client.get(`/admin/rule/${contestId}`),
  
  saveRule: (contestId: string, fileOrContent: File | string): Promise<void> => {
    const formData = new FormData();
    if (fileOrContent instanceof File) {
      formData.append('file', fileOrContent);
    } else {
      formData.append('content', fileOrContent);
    }
    return client.post(`/admin/rule/${contestId}`, formData);
  },

  processScoringStandard: (contestId: string,file: File): Promise<RuleConfig> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.put(`/admin/rule/${contestId}`, formData);
  },
  
};