// ==================== User Types ====================

export interface User {
  email: string;
  dify_user_id: string;
  role: 'admin' | 'owner' | 'user';
}

// ==================== Track Types ====================

export interface Track {
  id: string;
  name: string;
  description?: string;
  rule_id?: string;
}

// ==================== Contest Types ====================

export interface Contest {
  id: string;
  name: string;
  description?: string;
  logo?: string;  // Base64编码的竞赛logo
  status: 'active' | 'upcoming' | 'ended';
  start_time?: string;  // 竞赛开始时间 (ISO 8601 格式)
  end_time?: string;    // 竞赛结束时间 (ISO 8601 格式)
  is_published?: boolean;  // 是否上线（发布）
  endDate?: string;  // 兼容旧字段
  participants?: number;
  submissions?: number;
  tracks: Track[];
}

// ==================== Announcement Types ====================

export interface Announcement {
  content: string;
}

// ==================== Rule Types ====================

export interface RulePoint {
  point_name: string;
  max_score: number;
  description?: string;
}

export interface RuleDimension {
  dimension_name: string;
  dimension_weight: number;
  dimension_max_score: number;
  points: RulePoint[];
}

export interface RuleConfig {
  dimensions: RuleDimension[];
}

// ==================== Judge/Result Types ====================

export interface JudgePoint {
  point_name: string;
  score: number;
  max_score: number;
  reason: string;
  improve?: string;
}

export interface JudgeDimension {
  dimension_name: string;
  dimension_weight: number;
  dimension_score: number;
  dimension_max_score: number;
  points: JudgePoint[];
}

// 单评委结果（旧格式，向后兼容）
export interface JudgeResult {
  total_score: number;
  max_score: number;
  overall_comment: string;
  dimensions: JudgeDimension[];
}

// 多评委结构（新格式）
export interface JudgeEvaluation {
  judge_tag: 'A' | 'B' | 'C';
  judge_style: string;
  total_score: number;
  max_score: number;
  overall_comment: string;
  dimensions: JudgeDimension[];
}

export interface MultiJudgeResult {
  project_name: string;
  evaluations: JudgeEvaluation[];
}

export interface WorkflowMessage {
  text: string;
  type?: string;
}

export interface JudgeStatusResponse {
  status: 'pending' | 'running' | 'succeeded' | 'success' | 'failed' | 'error';
  progress?: string;
  messages?: WorkflowMessage[];
  workflow_data?: {
    workflow_data?: {
      data?: {
        outputs?: {
          text?: string | JudgeResult | MultiJudgeResult;
        };
        error?: string;
      };
    };
    messages?: WorkflowMessage[];
  };
}

export interface UploadResponse {
  filename: string;
}

export interface SubmitResponse {
  workflow_run_id: string;
}

// ==================== Certificate Verification Types ====================

export type VerificationStatus = 'idle' | 'loading' | 'success' | 'not_found' | 'mismatch';

export interface CaptchaTask {
  session_id: string;
  wait_time: number;
  width: number;
  height: number;
  bg_image: string;
}

export interface CaptchaPoint {
  x: number;
  y: number;
}

export interface CertificateExtractResponse {
  status: VerificationStatus;
  reg_no?: string;
  owner?: string;
  soft_name?: string;
}

// ==================== History Types ====================

export interface HistoryRecord {
  id: string;
  filename: string;
  contestName: string;
  time: string;
}

// ==================== API Error ====================

export interface ApiError {
  response?: {
    data?: {
      detail?: string;
    };
  };
  message: string;
}
