import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateEmbedding, listEmbeddingModels } from '@/lib/ollama';
import { serializeVector } from '@/lib/rag';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const collection = await db.collection.findUnique({
      where: { id },
    });
    
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }
    
    // Get all chunks without embeddings
    const chunks = await db.chunk.findMany({
      where: {
        collectionId: id,
        embedding: null,
      },
      include: { document: true },
    });
    
    if (chunks.length === 0) {
      return NextResponse.json({ message: 'No chunks to embed', embedded: 0 });
    }
    
    let embeddedCount = 0;
    const errors: string[] = [];
    
    for (const chunk of chunks) {
      try {
        const vector = await generateEmbedding(collection.embedModel, chunk.content);
        
        await db.embedding.create({
          data: {
            vector: serializeVector(vector),
            chunkId: chunk.id,
            collectionId: id,
          },
        });
        
        embeddedCount++;
      } catch (err) {
        console.error(`Failed to embed chunk ${chunk.id}:`, err);
        errors.push(`Chunk ${chunk.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    // Update document embedded status
    const documents = await db.document.findMany({
      where: { collectionId: id },
      include: { chunks: { include: { embedding: true } } },
    });
    
    for (const doc of documents) {
      const allEmbedded = doc.chunks.every(c => c.embedding !== null);
      if (allEmbedded && doc.chunks.length > 0) {
        await db.document.update({
          where: { id: doc.id },
          data: { embedded: true },
        });
      }
    }
    
    return NextResponse.json({
      message: `Embedded ${embeddedCount} of ${chunks.length} chunks`,
      embedded: embeddedCount,
      total: chunks.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Failed to generate embeddings:', error);
    return NextResponse.json({ error: 'Failed to generate embeddings' }, { status: 500 });
  }
}
