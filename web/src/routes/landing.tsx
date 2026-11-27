import { createLazyRoute } from '@tanstack/react-router'
import { HomePage } from '../HomePage'

// The landing page's chunk.
export const homeRoute = createLazyRoute('/')({ component: HomePage })
