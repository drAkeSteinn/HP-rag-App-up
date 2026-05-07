import { NextResponse } from 'next/server';
import { checkOllamaConnection } from '@/lib/ollama';

export async function GET() {
  try {
    const connected = await checkOllamaConnection();
    return NextResponse.json({ connected });
  } catch {
    return NextResponse.json({ connected: false }, { status: 200 });
  }
}
