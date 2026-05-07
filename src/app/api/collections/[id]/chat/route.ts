import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatWithModel, generateEmbedding } from '@/lib/ollama';
import { parseVector, findSimilarChunks, buildContext } from '@/lib/rag';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const messages = await db.chatMessage.findMany({
      where: { collectionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { message, enableWebSearch } = await request.json();

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const collection = await db.collection.findUnique({
      where: { id },
    });

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Save user message
    await db.chatMessage.create({
      data: {
        role: 'user',
        content: message,
        collectionId: id,
      },
    });

    // === Build RAG context from documents ===
    let ragContext = '';
    let ragSources: { id: string; content: string; documentName: string; similarity: number }[] = [];
    try {
      const queryVector = await generateEmbedding(collection.embedModel, message);

      const embeddings = await db.embedding.findMany({
        where: { collectionId: id },
        include: {
          chunk: {
            include: { document: true },
          },
        },
      });

      if (embeddings.length > 0) {
        const chunksWithVectors = embeddings.map(e => ({
          id: e.chunkId,
          content: e.chunk.content,
          documentName: e.chunk.document.name,
          vector: parseVector(e.vector),
        }));

        const similarChunks = findSimilarChunks(queryVector, chunksWithVectors, 5, 0.3);
        ragSources = similarChunks;
        ragContext = buildContext(similarChunks);
      }
    } catch (error) {
      console.error('RAG context building failed, continuing without context:', error);
    }

    // === Build Web Search context ===
    let webContext = '';
    let webSources = '';
    const shouldSearchWeb = enableWebSearch || collection.webSearch;
    if (shouldSearchWeb) {
      try {
        const webSearch = await import('@/lib/web-search');
        // Load saved search provider config
        let searchConfig = webSearch.DEFAULT_SEARCH_CONFIG;
        try {
          const setting = await db.appSetting.findUnique({ where: { key: 'web_search_config' } });
          if (setting) {
            searchConfig = JSON.parse(setting.value);
          }
        } catch { /* use default */ }
        const searchResults = await webSearch.searchWeb(message, 5, searchConfig);
        if (searchResults.length > 0) {
          webContext = webSearch.buildWebContext(searchResults);
          webSources = webSearch.formatSources(searchResults);
        }
      } catch (error) {
        console.error('Web search failed, continuing without web results:', error);
      }
    }

    // === Combine all context ===
    let fullContext = '';
    if (ragContext) {
      fullContext += `=== DOCUMENT CONTEXT ===\n${ragContext}`;
    }
    if (webContext) {
      if (fullContext) fullContext += '\n\n';
      fullContext += `=== WEB SEARCH RESULTS ===\n${webContext}`;
    }

    // === Get chat history (maintains conversation context) ===
    const history = await db.chatMessage.findMany({
      where: { collectionId: id },
      orderBy: { createdAt: 'asc' },
    });

    const messages = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // === Stream response from Ollama ===
    const stream = await chatWithModel(collection.chatModel, messages, fullContext || undefined);

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let fullThinking = '';
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n').filter(l => l.trim());

            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);

                // Capture thinking/reasoning from models like Qwen 3, DeepSeek-R1
                if (parsed.message?.thinking) {
                  fullThinking += parsed.message.thinking;
                  controller.enqueue(
                    encoder.encode(JSON.stringify({ thinking: parsed.message.thinking }) + '\n')
                  );
                }

                // Capture regular content
                if (parsed.message?.content) {
                  fullResponse += parsed.message.content;
                  controller.enqueue(
                    encoder.encode(JSON.stringify({ content: parsed.message.content }) + '\n')
                  );
                }

                // When stream is done, save the complete assistant message
                if (parsed.done) {
                  // Combine RAG sources and web sources into a single JSON
                  const allSources: { rag?: { id: string; content: string; documentName: string; similarity: number }[]; web?: { name: string; url: string }[] } = {};
                  if (ragSources.length > 0) {
                    allSources.rag = ragSources;
                  }
                  if (webSources) {
                    try { allSources.web = JSON.parse(webSources); } catch { /* skip */ }
                  }
                  await db.chatMessage.create({
                    data: {
                      role: 'assistant',
                      content: fullResponse,
                      thinking: fullThinking || null,
                      sources: Object.keys(allSources).length > 0 ? JSON.stringify(allSources) : null,
                      collectionId: id,
                    },
                  });
                }
              } catch {
                // Skip unparseable lines
              }
            }
          }
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
