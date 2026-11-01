import { ApiError } from './api'

// Turns a failure into text for the user, with a friendly wait time for rate limits.
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds) {
    const minutes = Math.ceil(error.retryAfterSeconds / 60)
    return `Too many attempts. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
