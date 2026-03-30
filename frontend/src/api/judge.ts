import client, { rawClient } from './client';
import type {
  UploadResponse,
  SubmitResponse,
  JudgeStatusResponse,
  VerificationStatus,
  CaptchaTask,
  CaptchaPoint,
  CertificateExtractResponse,
} from '@/types';

interface PendingCaptchasResponse {
  data?: CaptchaTask[];
}

interface VerifyInitResponse {
  code?: number;
  data?: unknown[];
}

export const judgeApi = {
  uploadFile: (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/upload', formData);
  },

  submitJudge: (contestId: string, filename: string, trackId?: string): Promise<SubmitResponse> =>
    client.post('/judge', {
      contest_id: contestId,
      filename,
      track_id: trackId,
    }),

  getStatus: (workflowRunId: string): Promise<JudgeStatusResponse> =>
    client.get(`/judge/${workflowRunId}/status`),

  getMock: (): Promise<SubmitResponse> => client.get('/judge/mock'),

  downloadPdf: (workflowRunId: string): Promise<Blob> =>
    rawClient
      .get(`/judge/${workflowRunId}/download_pdf`, {
        responseType: 'blob',
      })
      .then((res) => res.data),

  verifyCertificate: async (
    regNo: string,
    owner?: string,
    softName?: string
  ): Promise<{ status: VerificationStatus }> => {
    const keyword = owner || softName || '';

    try {
      const response: VerifyInitResponse = await client.post(
        '/verify/init-query',
        {
          register_no: regNo,
          keyword: keyword,
        },
        { timeout: 300000 }
      );

      if (response.code === 200) {
        const items = response.data;

        if (!items || items.length === 0) {
          return { status: 'not_found' };
        }

        const textContent = JSON.stringify(items);
        const ownerMatch = owner ? textContent.includes(owner) : true;
        const softNameMatch = softName ? textContent.includes(softName) : true;

        if (ownerMatch && softNameMatch) {
          return { status: 'success' };
        } else {
          return { status: 'mismatch' };
        }
      }

      return { status: 'not_found' };
    } catch (error) {
      console.error('核验接口异常:', error);
      throw error;
    }
  },

  getPendingCaptchas: (): Promise<CaptchaTask[]> =>
    client.get('/verify/pending').then((res: PendingCaptchasResponse) => {
      const tasks = res.data || res;
      return Array.isArray(tasks) ? tasks : [];
    }),

  submitCaptchaPoints: (sessionId: string, points: CaptchaPoint[]): Promise<unknown> =>
    client.post('/verify/submit-query', {
      session_id: sessionId,
      points: points,
    }),

  uploadAndVerifyCertificate: (file: File): Promise<CertificateExtractResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/verify/upload-extract', formData);
  },
};
