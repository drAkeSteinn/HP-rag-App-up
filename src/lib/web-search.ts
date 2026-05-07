/**
 * Web Search utility - Multi-provider support
 * Providers:
 * - zai: z-ai-web-dev-sdk (works in z-ai sandbox environment)
 * - duckduckgo: DuckDuckGo scraping (works anywhere, no API key needed)
 * - searxng: Self-hosted SearXNG instance (requires URL config)
 */

export interface SearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date?: string;
}

export type WebSearchProvider = 'zai' | 'duckduckgo' | 'searxng';

export interface WebSearchConfig {
  provider: WebSearchProvider;
  searxngUrl: string; // e.g., "http://localhost:8080"
}

// Default config - tries zai first, falls back to duckduckgo
export const DEFAULT_SEARCH_CONFIG: WebSearchConfig = {
  provider: 'duckduckgo',
  searxngUrl: 'http://localhost:8080',
};

// ==================== Z-AI Provider ====================
async function searchWithZAI(query: string, numResults: number): Promise<SearchResult[]> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const results = await zai.functions.invoke('web_search', {
      query,
      num: numResults,
    });
    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('Z-AI web search failed:', error);
    return [];
  }
}

// ==================== DuckDuckGo Provider ====================
async function searchWithDuckDuckGo(query: string, numResults: number): Promise<SearchResult[]> {
  try {
    const { search } = await import('duck-duck-scrape');
    const results = await search(query, {
      maxResults: numResults,
      safeSearch: 0,
    });

    if (!results.results || results.results.length === 0) {
      return [];
    }

    return results.results.slice(0, numResults).map((r, i) => ({
      url: r.url || '',
      name: r.title || 'Sin título',
      snippet: r.description || r.title || '',
      host_name: r.url ? new URL(r.url).hostname : '',
      rank: i + 1,
    }));
  } catch (error) {
    console.error('DuckDuckGo search failed:', error);
    return [];
  }
}

// ==================== SearXNG Provider ====================
async function searchWithSearXNG(query: string, numResults: number, searxngUrl: string): Promise<SearchResult[]> {
  try {
    const url = `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=es`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`SearXNG API error: ${res.status}`);
    }

    const data = await res.json();

    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.slice(0, numResults).map((r: Record<string, unknown>, i: number) => ({
      url: (r.url as string) || '',
      name: (r.title as string) || 'Sin título',
      snippet: (r.content as string) || '',
      host_name: r.url ? new URL(r.url as string).hostname : '',
      rank: i + 1,
      date: (r.publishedDate as string) || undefined,
    }));
  } catch (error) {
    console.error('SearXNG search failed:', error);
    return [];
  }
}

// ==================== Main search function ====================
export async function searchWeb(
  query: string,
  numResults: number = 5,
  config?: WebSearchConfig
): Promise<SearchResult[]> {
  const searchConfig = config || DEFAULT_SEARCH_CONFIG;

  switch (searchConfig.provider) {
    case 'zai':
      return searchWithZAI(query, numResults);
    case 'duckduckgo':
      return searchWithDuckDuckGo(query, numResults);
    case 'searxng':
      return searchWithSearXNG(query, numResults, searchConfig.searxngUrl);
    default:
      // Fallback to DuckDuckGo
      return searchWithDuckDuckGo(query, numResults);
  }
}

export function buildWebContext(results: SearchResult[]): string {
  if (results.length === 0) return '';

  return results
    .map((r, i) => `[Web Source ${i + 1}: ${r.name} (${r.host_name})]\n${r.snippet}\nURL: ${r.url}`)
    .join('\n\n');
}

export function formatSources(results: SearchResult[]): string {
  return JSON.stringify(
    results.map(r => ({
      name: r.name,
      url: r.url,
      snippet: r.snippet.substring(0, 200),
    }))
  );
}

// Test a search provider connection
export async function testSearchProvider(config: WebSearchConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const results = await searchWeb('test', 1, config);
    return { ok: results.length >= 0 }; // Even 0 results means the provider responded
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
