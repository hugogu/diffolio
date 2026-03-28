import { z } from 'zod'

const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 6, message: 'At least 6 characters' },
]

export function validatePassword(password: string): { valid: boolean; issues: string[] } {
  const issues = PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.message)
  return { valid: issues.length === 0, issues }
}

export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
