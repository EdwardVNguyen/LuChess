import { createLazyRoute } from '@tanstack/react-router'
import { HomePage } from '../HomePage'

// The landing page's chunk: the page and the board for its hero game.
export const homeRoute = createLazyRoute('/')({ component: HomePage })
