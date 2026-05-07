import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
    
    const collection = await db.collection.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        chatModel: chatModel || 'llama3.2',
        embedModel: embedModel || 'nomic-embed-text',
      },
    });
    
    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    console.error('Failed to create collection:', error);
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}
