import type { JudgeResult, JudgeStatusResponse, MultiJudgeResult, WrappedJudgeResult } from '@/types';

export type ParsedJudgeResult = JudgeResult | MultiJudgeResult;

export interface JudgeSummaryData {
  totalScore: number;
  maxScore: number;
  finalComment?: string;
  scoreReason?: string;
  usesFinalReview: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isMultiJudgeResult = (data: unknown): data is MultiJudgeResult =>
  isObject(data) &&
  typeof data.project_name === 'string' &&
  Array.isArray(data.evaluations);

export const isJudgeResult = (data: unknown): data is JudgeResult =>
  isObject(data) &&
  typeof data.total_score === 'number' &&
  typeof data.max_score === 'number' &&
  typeof data.overall_comment === 'string' &&
  Array.isArray(data.dimensions);

export const unwrapJudgeResult = (
  data: JudgeResult | MultiJudgeResult | WrappedJudgeResult | null | undefined
): ParsedJudgeResult | null => {
  if (!data) {
    return null;
  }

  if (isObject(data) && 'result' in data) {
    return unwrapJudgeResult((data as WrappedJudgeResult).result);
  }

  if (isMultiJudgeResult(data) || isJudgeResult(data)) {
    return data;
  }

  return null;
};

export const parseJudgeResult = (data: JudgeStatusResponse): ParsedJudgeResult | null => {
  try {
    const outputs = data?.workflow_data?.workflow_data?.data?.outputs;
    const deepOutput = outputs?.result ?? outputs?.text;
    if (!deepOutput) {
      return null;
    }

    const parsed = typeof deepOutput === 'string' ? JSON.parse(deepOutput) : deepOutput;
    return unwrapJudgeResult(parsed);
  } catch {
    return null;
  }
};

export const getJudgeSummaryScore = (result: ParsedJudgeResult): JudgeSummaryData => {
  if (isMultiJudgeResult(result)) {
    if (result.final_review) {
      return {
        totalScore: result.final_review.final_total_score,
        maxScore: result.final_review.final_max_score,
        finalComment: result.final_review.final_comment,
        scoreReason: result.final_review.score_reason,
        usesFinalReview: true,
      };
    }

    const evaluations = result.evaluations ?? [];
    if (evaluations.length === 0) {
      return {
        totalScore: 0,
        maxScore: 100,
        usesFinalReview: false,
      };
    }

    return {
      totalScore: Math.round(
        evaluations.reduce((sum, evaluation) => sum + evaluation.total_score, 0) / evaluations.length
      ),
      maxScore: evaluations[0]?.max_score ?? 100,
      usesFinalReview: false,
    };
  }

  return {
    totalScore: result.total_score,
    maxScore: result.max_score,
    usesFinalReview: false,
  };
};
