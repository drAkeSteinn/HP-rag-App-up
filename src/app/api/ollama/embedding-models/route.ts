import { NextResponse } from 'next/server';
import { listEmbeddingModels } from '@/lib/ollama';

export async function GET() {
  try {
    const models = await listEmbeddingModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.error('Failed to list embedding models:', error);
    return NextResponse.json({ models: [], error: 'Failed to fetch embedding models' }, { status: 500 });
  }
}
