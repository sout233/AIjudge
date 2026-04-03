import client from "./client";
import type {
  UploadResponse,
  SubmitResponse,
  JudgeStatusResponse,
} from "@/types";

const VERIFY_CERTIFICATE_TIMEOUT_MS = 20 * 60 * 1000;

export interface CertificateQueryItem {
  title: string;
  text: string;
}

export interface CertificateQueryResult {
  status: "found" | "not_found";
  items: CertificateQueryItem[];
}

export const judgeApi = {
  uploadFile: (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    return client.post("/upload", formData);
  },

  submitJudge: (contestId: string, filename: string, originalFilename?: string, trackId?: string): Promise<SubmitResponse> =>
    client.post("/judge", {
      contest_id: contestId,
      filename,
      original_filename: originalFilename,
      track_id: trackId
    }),

  submitBatchJudge: (contestId: string, files: { filename: string; original_filename: string }[], trackId?: string): Promise<{ tasks: { workflow_run_id: string; filename: string }[] }> =>
    client.post("/batch_judge", {
      contest_id: contestId,
      files,
      track_id: trackId
    }),

  submitZipBatchJudge: (contestId: string, zipFilename: string, trackId?: string): Promise<{ tasks: { workflow_run_id: string; filename: string }[] }> =>
    client.post("/zip_batch_judge", {
      contest_id: contestId,
      zip_filename: zipFilename,
      track_id: trackId
    }),

  getStatus: (workflowRunId: string): Promise<JudgeStatusResponse> =>
    client.get(`/judge/${workflowRunId}/status`),

  getHistory: (): Promise<any[]> => client.get("/history"),

  getMock: (): Promise<SubmitResponse> => client.get("/judge/mock"),

  downloadPdf: (workflowRunId: string): Promise<Blob> =>
    client.get(`/judge/${workflowRunId}/download_pdf`, {
      responseType: "blob",
    }),

  verifyCertificate: async (
    regNo: string,
    owner?: string,
    softName?: string,
  ): Promise<CertificateQueryResult> => {
    const keyword = owner || softName || "";

    try {
      const response: any = await client.post(
        "/verify/init-query",
        {
          register_no: regNo,
          keyword: keyword,
        },
        { timeout: VERIFY_CERTIFICATE_TIMEOUT_MS },
      );

      const payload = response.code !== undefined ? response : response.data;

      if (payload && payload.code === 200) {
        const items = Array.isArray(payload.data) ? payload.data : [];
        return {
          status: items.length > 0 ? "found" : "not_found",
          items,
        };
      }

      return { status: "not_found", items: [] };
    } catch (error) {
      console.error("核验接口异常:", error);
      throw error;
    }
  },

  uploadAndVerifyCertificate: (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append("file", file);
    return client.post("/verify/upload-extract", formData, {
      timeout: VERIFY_CERTIFICATE_TIMEOUT_MS,
    });
  },
};
