import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const SETTINGS_KEY = 'voice_config';

const DEFAULT_VOICE_CONFIG = {
  keyword: 'asistente HP',
  pauseDuration: 1.5,
  language: 'es-ES',
  enabled: false,
};

// GET - Retrieve voice settings
export async function GET() {
  try {
    const setting = await db.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });

    if (!setting) {
      return NextResponse.json({ config: DEFAULT_VOICE_CONFIG });
    }

    const config = JSON.parse(setting.value);
    return NextResponse.json({ config });
  } catch (error) {
    console.error('Failed to get voice settings:', error);
    return NextResponse.json({ config: DEFAULT_VOICE_CONFIG });
  }
}

// PUT - Update voice settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, pauseDuration, language, enabled } = body;

    const config = {
      keyword: typeof keyword === 'string' ? keyword : DEFAULT_VOICE_CONFIG.keyword,
      pauseDuration: typeof pauseDuration === 'number' ? pauseDuration : DEFAULT_VOICE_CONFIG.pauseDuration,
      language: typeof language === 'string' ? language : DEFAULT_VOICE_CONFIG.language,
      enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_VOICE_CONFIG.enabled,
    };

    await db.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: JSON.stringify(config) },
      create: { key: SETTINGS_KEY, value: JSON.stringify(config) },
    });

    return NextResponse.json({ config, message: 'Configuración de voz guardada' });
  } catch (error) {
    console.error('Failed to save voice settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
