import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chunkText } from '@/lib/rag';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const documents = await db.document.findMany({
      where: { collectionId: id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });
    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const text = formData.get('text') as string | null;
    
    let content = '';
    let name = '';
    let type = 'text';
    
    if (file) {
      name = file.name;
      type = file.type || 'text';
      content = await file.text();
    } else if (text) {
      name = formData.get('name') as string || 'Pasted Text';
      content = text;
      type = 'text';
    } else {
      return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
    }
    
    if (!content.trim()) {
      return NextResponse.json({ error: 'Empty content' }, { status: 400 });
    }
    
    // Chunk the document
    const chunks = chunkText(content);
    
    // Create document with chunks
    const document = await db.document.create({
      data: {
        name,
        type,
        content,
        chunkCount: chunks.length,
        embedded: false,
        collectionId: id,
        chunks: {
          create: chunks.map((chunkContent, index) => ({
            content: chunkContent,
            index,
            collectionId: id,
          })),
        },
      },
      include: { chunks: true },
    });
    
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('Failed to upload document:', error);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('docId');

    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 });
    }

    // Verify the document belongs to this collection
    const doc = await db.document.findFirst({
      where: { id: docId, collectionId: id },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    await db.document.delete({
      where: { id: docId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete document:', error);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
