import { createApiClient } from './api'
import { config } from './appConfig'

export const api = createApiClient(config.apiUrl)
