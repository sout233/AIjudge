import client from "./client";
import type {
  UploadResponse,
  SubmitResponse,
  JudgeStatusResponse,
} from "@/types";

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
  ): Promise<{ status: "success" | "not_found" | "mismatch" }> => {
    const keyword = owner || softName || "";

    try {
      const response: any = await client.post(
        "/verify/init-query",
        {
          register_no: regNo,
          keyword: keyword,
        },
        { timeout: 300000 },
      );

      console.log("【调试】后端返回结果:", response);

      const payload = response.code !== undefined ? response : response.data;

      if (payload && payload.code === 200) {
        const items = payload.data;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return { status: "not_found" };
        }

        const textContent = JSON.stringify(items);
        const ownerMatch = owner ? textContent.includes(owner) : true;
        const softNameMatch = softName ? textContent.includes(softName) : true;

        if (ownerMatch && softNameMatch) {
          return { status: "success" };
        } else {
          console.warn(
            "【调试】数据不匹配。目标:",
            { owner, softName },
            "实际文本:",
            textContent,
          );
          return { status: "mismatch" };
        }
      }

      return { status: "not_found" };
    } catch (error) {
      console.error("核验接口异常:", error);
      throw error;
    }
  },

  getPendingCaptchas: (): Promise<any> => client.get("/verify/pending"),

  submitCaptchaPoints: (
    sessionId: string,
    points: { x: number; y: number }[],
  ): Promise<any> =>
    client.post("/verify/submit-query", {
      session_id: sessionId,
      points: points,
    }),

  uploadAndVerifyCertificate: (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append("file", file);
    return client.post("/verify/upload-extract", formData);
  },
};
