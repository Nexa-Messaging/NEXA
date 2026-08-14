import { getSupabase } from '@/lib/supabase';
import { fallbackMessage } from '@/lib/messaging';
import { RecentSearch, SearchCategory, SearchResultRow } from '@/types/database';

export interface SearchResult<T> {
  data: T | null;
  error: string | null;
}

/** Searches every category (or a single one) through the `search_all` RPC. */
export async function searchAll(
  query: string,
  category: SearchCategory = 'all',
  limit = 20,
): Promise<SearchResult<SearchResultRow[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('search_all', {
    p_query: query,
    p_category: category,
    p_limit: limit,
  });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Search failed. Please try again.') };
  }
  return { data: ((data as unknown as SearchResultRow[]) ?? []) as SearchResultRow[], error: null };
}

/** Records a query in the caller's recent searches (capped at 10, de-duped). */
export async function addRecentSearch(query: string): Promise<SearchResult<null>> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('add_recent_search', { p_query: query });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not save your search.') };
  }
  return { data: null, error: null };
}

/** The caller's recent search queries, most recent first. */
export async function fetchRecentSearches(): Promise<SearchResult<RecentSearch[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_recent_searches');
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load your recent searches.') };
  }
  return { data: ((data as unknown as RecentSearch[]) ?? []) as RecentSearch[], error: null };
}

/** Clears the caller's recent search history. */
export async function clearRecentSearches(): Promise<SearchResult<null>> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('clear_recent_searches');
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not clear recent searches.') };
  }
  return { data: null, error: null };
}
