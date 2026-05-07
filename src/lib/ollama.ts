const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
}

export async function listOllamaModels(): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status}`);
    }
    const data: OllamaModelsResponse = await res.json();
    return data.models || [];
  } catch (error) {
    console.error('Failed to fetch Ollama models:', error);
    return [];
  }
}

export async function listChatModels(): Promise<OllamaModel[]> {
  const models = await listOllamaModels();
  // Filter out embedding models
  return models.filter(m => {
    const name = m.name.toLowerCase();
    const family = m.details?.family?.toLowerCase() || '';
    // Exclude embedding models
    if (name.includes('embed') || family.includes('embed')) return false;
    return true;
  });
}

export async function listEmbeddingModels(): Promise<OllamaModel[]> {
  const models = await listOllamaModels();
  // Filter for embedding models
  const embedModels = models.filter(m => {
    const name = m.name.toLowerCase();
    const family = m.details?.family?.toLowerCase() || '';
    if (name.includes('embed') || family.includes('embed')) return true;
    return false;
  });
  // If no embedding models found, return all models as potential embedding models
  if (embedModels.length === 0) {
    return models;
  }
  return embedModels;
}

export async function generateEmbedding(model: string, prompt: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: prompt }),
  });
  
  if (!res.ok) {
    throw new Error(`Ollama embed API error: ${res.status}`);
  }
  
  const data = await res.json();
  // The response has embeds array
  if (data.embeddings && data.embeddings.length > 0) {
    return data.embeddings[0];
  }
  // Fallback for older API
  if (data.embedding) {
    return data.embedding;
  }
  throw new Error('No embedding returned from Ollama');
}

export async function chatWithModel(
  model: string,
  messages: { role: string; content: string }[],
  context?: string
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = context
    ? `You are a helpful AI assistant. Use the following context to answer the user's question. If the context doesn't contain relevant information, say so honestly.

Context:
${context}

Instructions:
- Answer based on the provided context when available
- Be concise and accurate
- If you're unsure, say so`
    : 'You are a helpful AI assistant. Be concise and accurate.';

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      stream: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama chat API error: ${res.status}`);
  }

  return res.body as ReadableStream<Uint8Array>;
}

export async function checkOllamaConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
