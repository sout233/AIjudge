import { useState } from 'react';

const RESULT_KEY = 'aijudge_local_result';

export function useLocalResult() {
  const [result, setResult] = useState(() => {
    const saved = sessionStorage.getItem(RESULT_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const saveResult = (data: unknown) => {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(data));
    setResult(data);
  };

  const clearResult = () => {
    sessionStorage.removeItem(RESULT_KEY);
    setResult(null);
  };

  return { result, saveResult, clearResult };
}