// src/utils/errorClassify.ts

export type ErrorKind =
  | 'Network'
  | 'Timeout'
  | 'Abort'
  | 'RateLimit'
  | 'ServerUnavailable'
  | 'Unauthorized'
  | 'Forbidden'
  | 'NotFound'
  | 'BadRequest'
  | 'Conflict'
  | 'Server'
  | 'Unknown';

export type ClassifiedError = {
  kind: ErrorKind;
  status?: number;
  message: string;
  cause?: unknown;
};

export function classifyFetchError(input: unknown, status?: number): ClassifiedError {
  // AbortError
  if (input instanceof DOMException && input.name === 'AbortError') {
    return status !== undefined
      ? { kind: 'Abort', status, message: 'Request aborted', cause: input }
      : { kind: 'Abort', message: 'Request aborted', cause: input };
  }

  // Timeout heuristic
  if (input instanceof Error && /timeout/i.test(input.message)) {
    return status !== undefined
      ? { kind: 'Timeout', status, message: 'Request timed out', cause: input }
      : { kind: 'Timeout', message: 'Request timed out', cause: input };
  }

  // Network heuristic
  if (input instanceof TypeError && /fetch|network/i.test(input.message)) {
    return status !== undefined
      ? { kind: 'Network', status, message: 'Network error', cause: input }
      : { kind: 'Network', message: 'Network error', cause: input };
  }

  // HTTP status
  if (typeof status === 'number') {
    if (status === 401) return { kind: 'Unauthorized', status, message: 'Sign in required' };
    if (status === 403) return { kind: 'Forbidden', status, message: 'Access denied' };
    if (status === 404) return { kind: 'NotFound', status, message: 'Resource not found' };
    if (status === 409) return { kind: 'Conflict', status, message: 'Conflict' };
    if (status === 429) return { kind: 'RateLimit', status, message: 'Too many requests' };
    if (status === 503 || status === 502) return { kind: 'ServerUnavailable', status, message: 'Service unavailable' };
    if (status >= 500) return { kind: 'Server', status, message: 'Server error' };
    if (status >= 400) return { kind: 'BadRequest', status, message: 'Bad request' };
  }

  // Fallback
  const msg = input instanceof Error ? input.message : String(input ?? 'Unknown error');
  return status !== undefined
    ? { kind: 'Unknown', status, message: msg, cause: input }
    : { kind: 'Unknown', message: msg, cause: input };
}

export function friendlyMessage(err: ClassifiedError): string {
  switch (err.kind) {
    case 'Network': return 'Please check your connection and try again.';
    case 'Timeout': return 'The server took too long to respond. Try again.';
    case 'Abort': return 'Request was canceled.';
    case 'RateLimit': return 'You hit the rate limit. Wait a moment and retry.';
    case 'ServerUnavailable': return 'Service is temporarily unavailable. Retry shortly.';
    case 'Unauthorized': return 'Please sign in to continue.';
    case 'Forbidden': return 'You do not have permission for this action.';
    case 'NotFound': return 'We could not find that resource.';
    case 'BadRequest': return 'Invalid request.';
    case 'Conflict': return 'The resource was modified elsewhere. Refresh and retry.';
    case 'Server': return 'Server encountered an error. Try again.';
    default: return err.message || 'Something went wrong.';
  }
}

