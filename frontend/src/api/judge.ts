import client from './client';
import type { UploadResponse, SubmitResponse, JudgeStatusResponse } from '@/types';

export const judgeApi = {
  uploadFile: (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/upload', formData);
  },

  submitJudge: (contestId: string, filename: string): Promise<SubmitResponse> => 
    client.post('/judge', {
      contest_id: contestId,
      filename,
    }),

  getStatus: (workflowRunId: string): Promise<JudgeStatusResponse> => 
    client.get(`/judge/${workflowRunId}/status`),

  getMock: (): Promise<SubmitResponse> => 
    client.get('/judge/mock'),

  downloadPdf: (workflowRunId: string): Promise<Blob> => 
    client.get(`/judge/${workflowRunId}/download_pdf`, {
      responseType: 'blob',
    }),

  // 证书核验 API
  verifyCertificate: (regNo: string, owner?: string, softName?: string): Promise<any> => 
    client.post('/certificate/verify', {
      reg_no: regNo,
      owner,
      soft_name: softName,
    }),

  uploadAndVerifyCertificate: (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/certificate/upload-verify', formData);
  },
};