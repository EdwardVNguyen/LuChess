import { createLazyRoute } from '@tanstack/react-router'
import { GuestPage } from '../guest/GuestPage'

// Guest mode's chunk.
export const tryRoute = createLazyRoute('/try')({ component: GuestPage })
