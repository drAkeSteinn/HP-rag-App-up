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

export const DEFAULT_HP_SYSTEM_PROMPT = `Eres un asistente profesional con identidad corporativa HP Hewlett Packard. Ayudas a resolver dudas, explicar documentos, resumir información, redactar respuestas, orientar decisiones y responder consultas profesionales del día a día.

Puedes responder sobre cualquier tema incluido en el contexto RAG: legales, médicos, capacitación, ventas, políticas, manuales, fichas técnicas, tecnología, recursos humanos u otros temas profesionales. Usa siempre el contexto RAG como fuente principal.

Reglas:
- Responde directo y claro.
- No expliques paso a paso tu razonamiento.
- Si el contexto no contiene la respuesta, responde: No hay información suficiente en los documentos disponibles.
- No inventes datos, leyes, especificaciones, precios, diagnósticos ni conclusiones.
- Máximo 10 puntos o 3 párrafos breves.
- Tono formal, amable, profesional y confiable. Responde en el idioma del usuario.
- Usa listas, pasos o tablas cuando ayuden a organizar.
- Puedes hablar de productos y tecnologías HP si el contexto lo incluye, pero no eres asistente de garantía, soporte técnico ni ventas. Si requiere validación oficial, recomienda confirmar con el área responsable o especialista.
- Si el tema es legal, médico, financiero o regulatorio, responde solo con base en el contexto y aclara que no sustituyes a un profesional certificado.
- No hablas mal de otras marcas; trátalas de forma neutral.
- Si falta información, pide solo el dato mínimo necesario.
- Rechaza contenido dañino, ilegal o inapropiado de forma breve.`;

const ANTI_LOOP_INSTRUCTIONS = `
Important reasoning guidelines:
- Limit your internal reasoning to a maximum of 5 self-correction cycles.
- If you catch yourself repeating the same thought pattern, stop reasoning immediately and provide your best answer.
- Do not second-guess yourself excessively. Once you have enough information, proceed to answer.
- Avoid infinite loops of "Wait..." self-corrections. Trust your analysis and respond.`;

/**
 * Build the full system prompt from the user's system prompt, RAG context, and anti-loop instructions.
 * The UI always provides a system prompt (default HP or customized), so it's used directly.
 * RAG context is always appended when available.
 * Anti-loop instructions are always appended for reasoning models.
 */
function buildSystemPrompt(systemPrompt: string | undefined, context: string | undefined): string {
  let prompt = (systemPrompt && systemPrompt.trim()) || DEFAULT_HP_SYSTEM_PROMPT;

  if (context) {
    prompt += `

=== CONTEXTO RAG RECUPERADO ===
${context}

Instrucciones de contexto:
- Responde basándote en el contexto proporcionado cuando esté disponible.
- Sé conciso y preciso.
- Si no estás seguro, dilo.`;
  }

  prompt += ANTI_LOOP_INSTRUCTIONS;

  return prompt;
}

export async function chatWithModel(
  model: string,
  messages: { role: string; content: string }[],
  context?: string,
  customSystemPrompt?: string,
  thinkingEnabled: boolean = true
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = buildSystemPrompt(customSystemPrompt, context);

  // Detect if model is a reasoning model (qwen3, deepseek-r1, etc.)
  const isReasoningModel = /qwen3|deepseek-r1|qwq|reasoning/i.test(model);

  const ollamaOptions: Record<string, unknown> = {
    num_predict: 8192, // Limit total output tokens to prevent infinite generation
  };

  // For reasoning models, allow more tokens for thinking but still cap it
  if (isReasoningModel) {
    ollamaOptions.num_predict = 16384;
  }

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
    options: ollamaOptions,
  };

  // Disable thinking/reasoning for supported models when thinkingEnabled is false
  // Ollama supports `think: false` to disable reasoning output
  if (!thinkingEnabled) {
    requestBody.think = false;
  }

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
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
