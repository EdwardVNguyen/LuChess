import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../apiClient'
import { useSession } from '../session'

// Searching Notes by name, for Quick Find and the Link picker. Apart from
// queries.ts because Quick Find is in the header on every page: importing
// queries.ts there would load the Note screen's writing, PGN and chess code
// on the landing and login pages too.
export const searchKeys = {
  all: ['notes', 'search'] as const,
  search: (query: string) => ['notes', 'search', query] as const,
}

/** Pass the query already trimmed and debounced; a blank query asks nothing. */
export function useNoteSearch(query: string) {
  const { state, authorized } = useSession()
  return useQuery({
    queryKey: searchKeys.search(query),
    queryFn: () => authorized((token) => api.searchNotes(token, query)),
    enabled: state.status === 'authenticated' && query !== '',
    // Keep the last results on screen while the next keystroke's arrive.
    placeholderData: keepPreviousData,
  })
}
