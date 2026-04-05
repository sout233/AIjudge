import client, { rawClient } from './client';
import type {
  UploadResponse,
  SubmitResponse,
  JudgeStatusResponse,
  VerificationStatus,
  CertificateExtractResponse,
  JudgeHistory,
} from '@/types';

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

  uploadAndVerifyCertificate: (file: File): Promise<CertificateExtractResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/verify/upload-extract', formData);
  },
  submitBatchJudge: (contestId: string, filenames: string[], trackId?: string): Promise<{
    manifest_id: string;
    total: number;
    tasks: { workflow_run_id: string; filename: string }[];
  }> =>
    client.post("/batch_judge", {
      contest_id: contestId,
      filenames,
      track_id: trackId,
    }),

  submitZipBatchJudge: (contestId: string, zipFilename: string, trackId?: string): Promise<{
    manifest_id: string;
    type: string;
    total: number;
    queued: number;
    skipped: number;
    tasks: { workflow_run_id: string; filename: string }[];
  }> =>
    client.post("/zip_batch_judge", {
      contest_id: contestId,
      zip_filename: zipFilename,
      track_id: trackId,
    }),

  getZipBatchStatus: (manifestId: string): Promise<{
    manifest_id: string;
    type: string;
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
    progress: string;
    tasks: {
      filename: string;
      original_name: string;
      status: string;
      error: string | null;
      workflow_run_id: string;
      score?: number;
      max_score?: number;
    }[];
  }> =>
    client.get(`/zip_batch/${manifestId}/status`),

  exportZipBatch: (manifestId: string): Promise<Blob> =>
    rawClient
      .get(`/zip_batch/${manifestId}/export`, {
        responseType: 'blob',
      })
      .then((res) => res.data),

  getHistory: (): Promise<JudgeHistory[]> => client.get('/history'),

};
