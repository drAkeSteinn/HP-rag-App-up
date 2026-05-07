import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEFAULT_SEARCH_CONFIG, type WebSearchProvider, type WebSearchConfig, testSearchProvider } from '@/lib/web-search';

// Force recompile after Prisma schema change

const SETTINGS_KEY = 'web_search_config';

function validateProvider(value: string): value is WebSearchProvider {
  return ['zai', 'duckduckgo', 'searxng'].includes(value);
}

// GET - Retrieve web search settings
export async function GET() {
  try {
    const setting = await db.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });

    if (!setting) {
      return NextResponse.json({ config: DEFAULT_SEARCH_CONFIG });
    }

    const config = JSON.parse(setting.value) as WebSearchConfig;
    return NextResponse.json({ config });
  } catch (error) {
    console.error('Failed to get web search settings:', error);
    return NextResponse.json({ config: DEFAULT_SEARCH_CONFIG });
  }
}

// PUT - Update web search settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, searxngUrl } = body;

    if (!provider || !validateProvider(provider)) {
      return NextResponse.json(
        { error: 'Proveedor inválido. Debe ser: zai, duckduckgo, o searxng' },
        { status: 400 }
      );
    }

    const config: WebSearchConfig = {
      provider,
      searxngUrl: searxngUrl || DEFAULT_SEARCH_CONFIG.searxngUrl,
    };

    await db.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: JSON.stringify(config) },
      create: { key: SETTINGS_KEY, value: JSON.stringify(config) },
    });

    return NextResponse.json({ config, message: 'Configuración de búsqueda guardada' });
  } catch (error) {
    console.error('Failed to save web search settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

// POST - Test web search connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, searxngUrl } = body;

    if (!provider || !validateProvider(provider)) {
      return NextResponse.json(
        { error: 'Proveedor inválido' },
        { status: 400 }
      );
    }

    const config: WebSearchConfig = {
      provider,
      searxngUrl: searxngUrl || DEFAULT_SEARCH_CONFIG.searxngUrl,
    };

    const result = await testSearchProvider(config);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to test search provider:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Test failed' },
      { status: 500 }
    );
  }
}
