import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateEmbedding } from '@/lib/ollama';
import { chatWithProvider, DEFAULT_LLM_PROVIDER_CONFIG } from '@/lib/openai';
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

export async function DELETE(
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

    const result = await db.chatMessage.deleteMany({
      where: { collectionId: id },
    });

    return NextResponse.json({ message: 'Conversación reiniciada', deletedCount: result.count });
  } catch (error) {
    console.error('Failed to delete messages:', error);
    return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 });
  }
}

// Threshold for loop detection — number of "Wait" patterns before truncating thinking
const LOOP_THRESHOLD = 20;

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

    // === Load LLM provider config ===
    let providerConfig = DEFAULT_LLM_PROVIDER_CONFIG;
    try {
      const llmSetting = await db.appSetting.findUnique({ where: { key: 'llm_provider_config' } });
      if (llmSetting) {
        providerConfig = { ...DEFAULT_LLM_PROVIDER_CONFIG, ...JSON.parse(llmSetting.value) };
      }
    } catch { /* use default */ }

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

    const embedModelToUse = providerConfig.defaultEmbedModel || collection.embedModel;
    try {
      const queryVector = await generateEmbedding(embedModelToUse, message);

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

    // === Get chat history ===
    const history = await db.chatMessage.findMany({
      where: { collectionId: id },
      orderBy: { createdAt: 'asc' },
    });

    const messages = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // === Stream response from the selected provider ===
    const ollamaModel = providerConfig.defaultChatModel || collection.chatModel;
    const stream = await chatWithProvider(
      providerConfig,
      ollamaModel,
      messages,
      fullContext || undefined
    );

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let fullThinking = '';
    let thinkingTruncated = false;
    const encoder = new TextEncoder();

    // Reasoning settings from config
    const thinkingEnabled = providerConfig.thinkingEnabled ?? true;
    const maxThinkingTokens = providerConfig.maxThinkingTokens || 0;
    const maxThinkingSeconds = providerConfig.maxThinkingSeconds || 0;
    const thinkingStartTime = Date.now();

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

                // Helper: process thinking content with loop + time + token limits
                const processThinking = (thinkingText: string) => {
                  // If thinking is disabled, silently skip all thinking tokens
                  if (!thinkingEnabled) return;

                  if (thinkingTruncated) return; // Already truncated, skip further thinking

                  fullThinking += thinkingText;

                  // --- Check 1: Loop pattern detection ---
                  const waitCount = (fullThinking.match(/\*?\(?Wait[,\s]/gi) || []).length;
                  if (waitCount > LOOP_THRESHOLD) {
                    thinkingTruncated = true;
                    controller.enqueue(
                      encoder.encode(JSON.stringify({
                        thinking: '\n\n[⚠️ Razonamiento truncado: el modelo entró en un bucle de auto-corrección. Esperando respuesta...]'
                      }) + '\n')
                    );
                    return;
                  }

                  // --- Check 2: Thinking token/character limit ---
                  if (maxThinkingTokens > 0 && fullThinking.length > maxThinkingTokens) {
                    thinkingTruncated = true;
                    controller.enqueue(
                      encoder.encode(JSON.stringify({
                        thinking: `\n\n[⚠️ Razonamiento truncado: límite de ${maxThinkingTokens.toLocaleString()} caracteres alcanzado. Esperando respuesta...]`
                      }) + '\n')
                    );
                    return;
                  }

                  // --- Check 3: Thinking time limit ---
                  if (maxThinkingSeconds > 0 && fullResponse.length === 0) {
                    const elapsedSeconds = (Date.now() - thinkingStartTime) / 1000;
                    if (elapsedSeconds > maxThinkingSeconds) {
                      thinkingTruncated = true;
                      controller.enqueue(
                        encoder.encode(JSON.stringify({
                          thinking: `\n\n[⚠️ Razonamiento truncado: límite de ${maxThinkingSeconds}s de razonamiento alcanzado. Esperando respuesta...]`
                      }) + '\n')
                      );
                      return;
                    }
                  }

                  // Forward thinking normally
                  controller.enqueue(
                    encoder.encode(JSON.stringify({ thinking: thinkingText }) + '\n')
                  );
                };

                // OpenAI format: { thinking: "..." } directly
                if (parsed.thinking) {
                  processThinking(parsed.thinking);
                }

                // Ollama format: { message: { thinking: "..." } }
                if (parsed.message?.thinking) {
                  processThinking(parsed.message.thinking);
                }

                // Ollama reasoning models: "think" field
                if (parsed.think && !parsed.thinking) {
                  processThinking(parsed.think);
                }

                // Ollama format: { message: { think: "..." } }
                if (parsed.message?.think && !parsed.message?.thinking) {
                  processThinking(parsed.message.think);
                }

                // OpenAI format: { content: "..." } directly
                if (parsed.content) {
                  fullResponse += parsed.content;
                  controller.enqueue(
                    encoder.encode(JSON.stringify({ content: parsed.content }) + '\n')
                  );
                }

                // Ollama format: { message: { content: "..." } }
                if (parsed.message?.content) {
                  fullResponse += parsed.message.content;
                  controller.enqueue(
                    encoder.encode(JSON.stringify({ content: parsed.message.content }) + '\n')
                  );
                }

                // When stream is done, save the complete assistant message
                if (parsed.done) {
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
