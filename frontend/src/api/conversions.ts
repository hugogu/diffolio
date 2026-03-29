// api/conversions.ts

import { apiFetch } from './client'

export type ConversionInputFormat = 'MDX'
export type ConversionOutputFormat = 'TXT' | 'DOCX'
export type ConversionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'

export interface ConversionTask {
  id: string
  inputFormat: ConversionInputFormat
  outputFormat: ConversionOutputFormat
  status: ConversionStatus
  progress: number
  fileSize: number
  errorMessage?: string
  createdAt: string
  updatedAt?: string
  completedAt?: string
  expiresAt?: string
}

export interface PaginatedConversions {
  data: ConversionTask[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function createConversion(
  file: File,
  inputFormat: ConversionInputFormat,
  outputFormat: ConversionOutputFormat
): Promise<ConversionTask> {
  const formData = new FormData()
  formData.append('inputFormat', inputFormat)
  formData.append('outputFormat', outputFormat)
  formData.append('file', file)

  return apiFetch<ConversionTask>('/api/v1/conversions', {
    method: 'POST',
    body: formData,
  })
}

export async function listConversions(
  page = 1,
  pageSize = 20
): Promise<PaginatedConversions> {
  return apiFetch<PaginatedConversions>(`/api/v1/conversions?page=${page}&pageSize=${pageSize}`)
}

export async function getConversion(id: string): Promise<ConversionTask> {
  return apiFetch<ConversionTask>(`/api/v1/conversions/${id}`)
}

export async function downloadConversion(id: string): Promise<Blob> {
  const response = await fetch(`/api/v1/conversions/${id}/download`, {
    credentials: 'include',
  })
  
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`)
  }
  
  return response.blob()
}

export async function deleteConversion(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/conversions/${id}`, {
    method: 'DELETE',
  })
}
