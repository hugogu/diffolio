export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE_URL = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? ''

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers as Record<string, string> }
  // Only set Content-Type if body is present and it's not already set
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    let body: { code?: string; message?: string; details?: unknown } = {}
    try {
      body = await response.json()
    } catch {
      // ignore
    }
    throw new ApiError(
      response.status,
      body.code ?? 'UNKNOWN_ERROR',
      body.message ?? `HTTP ${response.status}`,
      body.details
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
