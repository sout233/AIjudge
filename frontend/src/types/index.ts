// Contest types
export interface Contest {
  id: string;
  name: string;
  description?: string;
  status?: string;
  endDate: string;
  participants: string;
  submissions: string;
  category: string;
}

// Announcement types
export interface Announcement {
  content: string;
}

// Rule types
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

// Judge/Result types
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

export interface SingleEvaluation {
  judge_tag: string;
  judge_style: string;
  total_score: number;
  max_score: number;
  dimensions: JudgeDimension[];
  overall_comment: string;
}

export interface JudgeResult {
  project_name: string;
  evaluations: SingleEvaluation[];
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
          text?: string | JudgeResult;
        };
        error?: string;
      };
    };
    messages?: WorkflowMessage[];
    metadata?: {
      filename: string;
      contest_id: string;
      created_at: string;
    };
  };
}

export interface UploadResponse {
  filename: string;
}

export interface SubmitResponse {
  workflow_run_id: string;
}

// History types
export interface JudgeHistory {
  workflow_run_id: string;
  filename: string;
  contest_id: string;
  status: string;
  created_at: string;
  elapsed_time: number;
}

export interface HistoryRecord {
  id: string;
  filename: string;
  contestName: string;
  time: string;
}

// API Error
export interface ApiError {
  response?: {
    data?: {
      detail?: string;
    };
  };
  message: string;
}
// src/types/index.ts
export interface User {
  email: string;
  dify_user_id: string;
  role: 'admin' | 'owner' | 'user';
}