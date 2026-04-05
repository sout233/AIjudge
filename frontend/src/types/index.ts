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
  logo?: string;
  status: 'active' | 'upcoming' | 'ended';
  start_time?: string;
  end_time?: string;
  is_published?: boolean;
  endDate?: string;
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

export interface JudgeResult {
  total_score: number;
  max_score: number;
  overall_comment: string;
  dimensions: JudgeDimension[];
}

export interface FinalReview {
  final_total_score: number;
  final_max_score: number;
  final_comment: string;
  score_reason: string;
}

export interface JudgeEvaluation {
  judge_tag: string;
  project_name?: string;
  judge_style: string;
  total_score: number;
  max_score: number;
  overall_comment: string;
  dimensions: JudgeDimension[];
}

export interface MultiJudgeResult {
  project_name: string;
  final_review?: FinalReview;
  evaluations: JudgeEvaluation[];
}

export interface WrappedJudgeResult {
  result: JudgeResult | MultiJudgeResult;
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
          result?: JudgeResult | MultiJudgeResult | WrappedJudgeResult;
          text?: string | JudgeResult | MultiJudgeResult | WrappedJudgeResult;
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

export interface JudgeHistory {
  workflow_run_id: string;
  filename: string;
  contest_id: string;
  track_id?: string;
  status: 'pending' | 'running' | 'succeeded' | 'success' | 'failed' | 'error';
  created_at: string;
  elapsed_time: number;
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
