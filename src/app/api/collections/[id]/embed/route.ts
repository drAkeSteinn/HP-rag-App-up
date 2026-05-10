import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateEmbedding } from '@/lib/ollama';
import { serializeVector } from '@/lib/rag';
import { DEFAULT_LLM_PROVIDER_CONFIG } from '@/lib/openai';

// Max chunks to embed per request to avoid timeouts
const BATCH_SIZE = 10;

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

    // Load global default embed model from LLM provider config
    let globalDefaults = DEFAULT_LLM_PROVIDER_CONFIG;
    try {
      const llmSetting = await db.appSetting.findUnique({ where: { key: 'llm_provider_config' } });
      if (llmSetting) {
        globalDefaults = { ...DEFAULT_LLM_PROVIDER_CONFIG, ...JSON.parse(llmSetting.value) };
      }
    } catch { /* use defaults */ }

    // Use global default embed model, fallback to collection's stored model
    const embedModelToUse = globalDefaults.defaultEmbedModel || collection.embedModel;

    // Get total count of unembedded chunks first
    const totalUnembedded = await db.chunk.count({
      where: {
        collectionId: id,
        embedding: null,
      },
    });

    if (totalUnembedded === 0) {
      return NextResponse.json({
        message: 'No chunks to embed',
        embedded: 0,
        total: 0,
        remaining: 0,
        done: true,
      });
    }

    // Get only a batch of chunks without embeddings
    const chunks = await db.chunk.findMany({
      where: {
        collectionId: id,
        embedding: null,
      },
      take: BATCH_SIZE,
      include: { document: true },
    });

    let embeddedCount = 0;
    const errors: string[] = [];

    for (const chunk of chunks) {
      try {
        const vector = await generateEmbedding(embedModelToUse, chunk.content);

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

    // Check remaining after this batch
    const remaining = await db.chunk.count({
      where: {
        collectionId: id,
        embedding: null,
      },
    });

    // Update document embedded status for documents whose chunks are all now embedded
    const documents = await db.document.findMany({
      where: { collectionId: id, embedded: false },
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
      message: `Embedded ${embeddedCount} of ${chunks.length} chunks (batch)`,
      embedded: embeddedCount,
      total: totalUnembedded,
      batchSize: chunks.length,
      remaining,
      done: remaining === 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Failed to generate embeddings:', error);
    return NextResponse.json({ error: 'Failed to generate embeddings' }, { status: 500 });
  }
}
