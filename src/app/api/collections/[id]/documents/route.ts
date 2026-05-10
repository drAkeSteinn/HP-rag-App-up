import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chunkText, getChunkStats } from '@/lib/rag';

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

    // Check for multiple files first (batch upload)
    const files = formData.getAll('files') as File[];
    const singleFile = formData.get('file') as File | null;
    const text = formData.get('text') as string | null;
    const chunkSizeStr = formData.get('chunkSize') as string | null;
    const overlapStr = formData.get('overlap') as string | null;
    const previewOnly = formData.get('preview') as string | null;

    // Parse optional chunking parameters
    const chunkSize = chunkSizeStr ? parseInt(chunkSizeStr, 10) : undefined;
    const overlap = overlapStr ? parseInt(overlapStr, 10) : undefined;

    // Batch upload: multiple files
    if (files.length > 0) {
      const results: { name: string; success: boolean; chunkCount?: number; error?: string }[] = [];

      for (const file of files) {
        try {
          const content = await file.text();
          if (!content.trim()) {
            results.push({ name: file.name, success: false, error: 'Empty content' });
            continue;
          }

          const chunks = chunkText(content, chunkSize, overlap);

          await db.document.create({
            data: {
              name: file.name,
              type: file.type || 'text',
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
          });

          results.push({ name: file.name, success: true, chunkCount: chunks.length });
        } catch (err) {
          console.error(`Failed to process file ${file.name}:`, err);
          results.push({ name: file.name, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return NextResponse.json({
        batch: true,
        total: files.length,
        succeeded,
        failed,
        results,
      }, { status: 201 });
    }

    // Single file or text upload (original behavior)
    let content = '';
    let name = '';
    let type = 'text';

    if (singleFile) {
      name = singleFile.name;
      type = singleFile.type || 'text';
      content = await singleFile.text();
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

    // If preview mode, return stats without creating document
    if (previewOnly === 'true') {
      const stats = getChunkStats(content);
      const chunks = chunkText(content, chunkSize, overlap);
      return NextResponse.json({
        stats,
        chunkSize: chunkSize || 1200,
        overlap: overlap || 200,
        chunkCount: chunks.length,
        chunks: chunks.map((c, i) => ({
          index: i,
          length: c.length,
          preview: c.slice(0, 150) + (c.length > 150 ? '...' : ''),
        })),
      });
    }

    // Chunk the document
    const chunks = chunkText(content, chunkSize, overlap);

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
