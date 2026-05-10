import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEFAULT_LLM_PROVIDER_CONFIG, syncApiKeyFromGoogleDrive } from '@/lib/openai';

const SETTINGS_KEY = 'llm_provider_config';

// GET - Retrieve LLM provider settings
export async function GET() {
  try {
    const setting = await db.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });

    if (!setting) {
      return NextResponse.json({ config: { ...DEFAULT_LLM_PROVIDER_CONFIG, hasApiKey: false } });
    }

    const config = JSON.parse(setting.value);
    // Never send the API key to the client - only indicate if one exists
    const safeConfig = {
      provider: config.provider || 'local',
      openaiModel: config.openaiModel || 'gpt-5.4-mini',
      defaultChatModel: config.defaultChatModel || 'llama3.2',
      defaultEmbedModel: config.defaultEmbedModel || 'nomic-embed-text',
      systemPrompt: config.systemPrompt || '',
      thinkingEnabled: config.thinkingEnabled ?? DEFAULT_LLM_PROVIDER_CONFIG.thinkingEnabled,
      maxThinkingTokens: config.maxThinkingTokens ?? DEFAULT_LLM_PROVIDER_CONFIG.maxThinkingTokens,
      maxThinkingSeconds: config.maxThinkingSeconds ?? DEFAULT_LLM_PROVIDER_CONFIG.maxThinkingSeconds,
      hasApiKey: !!(config.openaiApiKey),
    };
    return NextResponse.json({ config: safeConfig });
  } catch (error) {
    console.error('Failed to get LLM provider settings:', error);
    return NextResponse.json({ config: { ...DEFAULT_LLM_PROVIDER_CONFIG, hasApiKey: false } });
  }
}

// PUT - Update LLM provider settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, openaiApiKey, openaiModel, defaultChatModel, defaultEmbedModel, systemPrompt, thinkingEnabled, maxThinkingTokens, maxThinkingSeconds } = body;

    // Load existing config to preserve API key if not being updated
    const existingSetting = await db.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    let existingConfig = DEFAULT_LLM_PROVIDER_CONFIG;
    if (existingSetting) {
      try { existingConfig = JSON.parse(existingSetting.value); } catch { /* use default */ }
    }

    // Only update API key if a new one is provided (starts with 'sk-')
    // If the key is empty string, preserve the existing one (frontend sends empty when not changing)
    // Special value 'CLEAR' explicitly clears the saved key
    let resolvedApiKey = existingConfig.openaiApiKey;
    if (typeof openaiApiKey === 'string' && openaiApiKey.startsWith('sk-')) {
      resolvedApiKey = openaiApiKey;
    } else if (typeof openaiApiKey === 'string' && openaiApiKey === 'CLEAR') {
      resolvedApiKey = '';
    }

    const config = {
      provider: provider === 'online' ? 'online' : 'local',
      openaiApiKey: resolvedApiKey,
      openaiModel: typeof openaiModel === 'string' ? openaiModel : DEFAULT_LLM_PROVIDER_CONFIG.openaiModel,
      defaultChatModel: typeof defaultChatModel === 'string' && defaultChatModel ? defaultChatModel : existingConfig.defaultChatModel || DEFAULT_LLM_PROVIDER_CONFIG.defaultChatModel,
      defaultEmbedModel: typeof defaultEmbedModel === 'string' && defaultEmbedModel ? defaultEmbedModel : existingConfig.defaultEmbedModel || DEFAULT_LLM_PROVIDER_CONFIG.defaultEmbedModel,
      systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : existingConfig.systemPrompt || '',
      thinkingEnabled: typeof thinkingEnabled === 'boolean' ? thinkingEnabled : existingConfig.thinkingEnabled ?? DEFAULT_LLM_PROVIDER_CONFIG.thinkingEnabled,
      maxThinkingTokens: typeof maxThinkingTokens === 'number' ? maxThinkingTokens : existingConfig.maxThinkingTokens ?? DEFAULT_LLM_PROVIDER_CONFIG.maxThinkingTokens,
      maxThinkingSeconds: typeof maxThinkingSeconds === 'number' ? maxThinkingSeconds : existingConfig.maxThinkingSeconds ?? DEFAULT_LLM_PROVIDER_CONFIG.maxThinkingSeconds,
    };

    await db.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: JSON.stringify(config) },
      create: { key: SETTINGS_KEY, value: JSON.stringify(config) },
    });

    // Never return the API key - only indicate if one exists
    const safeConfig = {
      provider: config.provider,
      openaiModel: config.openaiModel,
      defaultChatModel: config.defaultChatModel,
      defaultEmbedModel: config.defaultEmbedModel,
      systemPrompt: config.systemPrompt,
      thinkingEnabled: config.thinkingEnabled,
      maxThinkingTokens: config.maxThinkingTokens,
      maxThinkingSeconds: config.maxThinkingSeconds,
      hasApiKey: !!config.openaiApiKey,
    };

    return NextResponse.json({ config: safeConfig, message: 'Configuración de proveedor guardada' });
  } catch (error) {
    console.error('Failed to save LLM provider settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

// POST - Sync API key from Google Drive
export async function POST() {
  try {
    const result = await syncApiKeyFromGoogleDrive();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Save the synced key
    const existingSetting = await db.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });

    let currentConfig = DEFAULT_LLM_PROVIDER_CONFIG;
    if (existingSetting) {
      try {
        currentConfig = JSON.parse(existingSetting.value);
      } catch { /* use default */ }
    }

    const updatedConfig = {
      ...currentConfig,
      openaiApiKey: result.apiKey,
    };

    await db.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: JSON.stringify(updatedConfig) },
      create: { key: SETTINGS_KEY, value: JSON.stringify(updatedConfig) },
    });

    // Never return the actual key - only confirm success
    return NextResponse.json({
      success: true,
      hasApiKey: true,
      message: 'API key sincronizada exitosamente',
    });
  } catch (error) {
    console.error('Failed to sync API key:', error);
    return NextResponse.json({ error: 'Failed to sync API key' }, { status: 500 });
  }
}
