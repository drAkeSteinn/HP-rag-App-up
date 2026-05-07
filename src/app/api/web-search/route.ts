import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { query, num } = await request.json();

    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Dynamically import to avoid loading SDK on other routes
    const { searchWeb } = await import('@/lib/web-search');
    const results = await searchWeb(query.trim(), num || 5);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Web search API error:', error);
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 });
  }
}
