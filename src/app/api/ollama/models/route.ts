import { NextResponse } from 'next/server';
import { listChatModels } from '@/lib/ollama';

export async function GET() {
  try {
    const models = await listChatModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.error('Failed to list chat models:', error);
    return NextResponse.json({ models: [], error: 'Failed to fetch models' }, { status: 500 });
  }
}
