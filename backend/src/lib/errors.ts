export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
    public rootCause?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Error response structure for API responses
 */
export interface ErrorResponse {
  code: string
  message: string
  details?: unknown
  rootCause?: string
  stack?: string
}

/**
 * Helper to extract root cause from any error
 */
export function extractRootCause(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error'
}

/**
 * HTTP 400 - Bad Request
 */
export function badRequest(message: string, details?: unknown, rootCause?: string): ApiError {
  return new ApiError(400, 'BAD_REQUEST', message, details, rootCause)
}

/**
 * HTTP 401 - Unauthorized
 */
export function unauthorized(message = 'Authentication required', rootCause?: string): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message, undefined, rootCause)
}

/**
 * HTTP 402 - Payment Required (subscription/feature limit)
 */
export function paymentRequired(code: string, message: string, rootCause?: string): ApiError {
  return new ApiError(402, code, message, undefined, rootCause)
}

/**
 * HTTP 403 - Forbidden
 */
export function forbidden(message = 'Insufficient permissions', rootCause?: string): ApiError {
  return new ApiError(403, 'FORBIDDEN', message, undefined, rootCause)
}

/**
 * HTTP 404 - Not Found
 */
export function notFound(entity: string, id?: string, rootCause?: string): ApiError {
  return new ApiError(
    404,
    'NOT_FOUND',
    id ? `${entity} with id '${id}' not found` : `${entity} not found`,
    { entity, id },
    rootCause
  )
}

/**
 * HTTP 409 - Conflict
 */
export function conflict(message: string, rootCause?: string): ApiError {
  return new ApiError(409, 'CONFLICT', message, undefined, rootCause)
}

/**
 * HTTP 422 - Unprocessable Entity
 */
export function unprocessable(message: string, details?: unknown, rootCause?: string): ApiError {
  return new ApiError(422, 'UNPROCESSABLE_ENTITY', message, details, rootCause)
}

/**
 * HTTP 429 - Too Many Requests
 */
export function tooManyRequests(message = 'Rate limit exceeded', retryAfter?: number, rootCause?: string): ApiError {
  return new ApiError(
    429,
    'RATE_LIMITED',
    message,
    retryAfter ? { retryAfter } : undefined,
    rootCause
  )
}

/**
 * HTTP 500 - Internal Server Error
 */
export function internalError(message = 'Internal server error', rootCause?: string): ApiError {
  return new ApiError(500, 'INTERNAL_ERROR', message, undefined, rootCause)
}

/**
 * HTTP 503 - Service Unavailable
 */
export function serviceUnavailable(message = 'Service temporarily unavailable', rootCause?: string): ApiError {
  return new ApiError(503, 'SERVICE_UNAVAILABLE', message, undefined, rootCause)
}
