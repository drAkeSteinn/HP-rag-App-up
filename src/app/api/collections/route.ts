import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEFAULT_LLM_PROVIDER_CONFIG } from '@/lib/openai';

export async function GET() {
  try {
    const collections = await db.collection.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { documents: true, messages: true },
        },
      },
    });
    return NextResponse.json({ collections });
  } catch (error) {
    console.error('Failed to fetch collections:', error);
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, chatModel, embedModel } = body;
    
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Load global default models from LLM provider config
    let globalDefaults = DEFAULT_LLM_PROVIDER_CONFIG;
    try {
      const llmSetting = await db.appSetting.findUnique({ where: { key: 'llm_provider_config' } });
      if (llmSetting) {
        globalDefaults = { ...DEFAULT_LLM_PROVIDER_CONFIG, ...JSON.parse(llmSetting.value) };
      }
    } catch { /* use defaults */ }

    // If provider is online, the chat model should be the OpenAI model
    // Otherwise use the configured default chat model from Ollama
    const resolvedChatModel = chatModel || (
      globalDefaults.provider === 'online' 
        ? globalDefaults.openaiModel 
        : globalDefaults.defaultChatModel
    );
    const resolvedEmbedModel = embedModel || globalDefaults.defaultEmbedModel;
    
    const collection = await db.collection.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        chatModel: resolvedChatModel,
        embedModel: resolvedEmbedModel,
      },
    });
    
    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    console.error('Failed to create collection:', error);
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}
