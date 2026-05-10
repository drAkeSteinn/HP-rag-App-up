import { chatWithModel, DEFAULT_HP_SYSTEM_PROMPT } from './ollama';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';

export interface LLMProviderConfig {
  provider: 'local' | 'online';
  openaiApiKey: string;
  openaiModel: string;
  defaultChatModel: string;
  defaultEmbedModel: string;
  systemPrompt: string;
  // Reasoning settings
  thinkingEnabled: boolean;        // Enable/disable reasoning/thinking output
  maxThinkingTokens: number;       // Max characters of thinking before truncation (0 = no limit)
  maxThinkingSeconds: number;      // Max seconds of pure thinking before truncation (0 = no limit)
}

export const DEFAULT_LLM_PROVIDER_CONFIG: LLMProviderConfig = {
  provider: 'local',
  openaiApiKey: '',
  openaiModel: DEFAULT_OPENAI_MODEL,
  defaultChatModel: 'llama3.2',
  defaultEmbedModel: 'nomic-embed-text',
  systemPrompt: '',
  thinkingEnabled: true,
  maxThinkingTokens: 8000,
  maxThinkingSeconds: 60,
};

// Use the single source of truth from ollama.ts
// DEFAULT_HP_SYSTEM_PROMPT is imported from './ollama'

const ANTI_LOOP_INSTRUCTIONS = `
Important reasoning guidelines:
- Limit your internal reasoning to a maximum of 5 self-correction cycles.
- If you catch yourself repeating the same thought pattern, stop reasoning immediately and provide your best answer.
- Do not second-guess yourself excessively. Once you have enough information, proceed to answer.
- Avoid infinite loops of "Wait..." self-corrections. Trust your analysis and respond.`;

/**
 * Build the full system prompt from the user's system prompt, RAG context, and anti-loop instructions.
 * The UI always provides a system prompt (default HP or customized), so it's used directly.
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

/**
 * Chat with OpenAI API (streaming response)
 * Returns a ReadableStream that yields JSON objects compatible with the Ollama format:
 * { content: string } and optionally { thinking: string }
 */
export async function chatWithOpenAI(
  apiKey: string,
  messages: { role: string; content: string }[],
  context?: string,
  model: string = DEFAULT_OPENAI_MODEL,
  customSystemPrompt?: string,
  thinkingEnabled: boolean = true
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = buildSystemPrompt(customSystemPrompt, context);

  const requestConfig: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
    max_tokens: 8192, // Limit total output tokens to prevent infinite generation
  };

  // For OpenAI reasoning models, we can hint to suppress reasoning
  if (!thinkingEnabled) {
    requestConfig.reasoning_effort = 'none';
  }

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestConfig),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`OpenAI API error: ${res.status} - ${errorBody}`);
  }

  // Convert OpenAI SSE stream to our internal format (compatible with Ollama)
  const encoder = new TextEncoder();
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No reader available from OpenAI');

  const readableStream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6); // Remove 'data: ' prefix
            if (data === '[DONE]') {
              // Signal done in our format
              controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + '\n'));
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.content) {
                controller.enqueue(
                  encoder.encode(JSON.stringify({ content: delta.content }) + '\n')
                );
              }

              // Some OpenAI models support reasoning/thinking
              if (delta?.reasoning_content) {
                controller.enqueue(
                  encoder.encode(JSON.stringify({ thinking: delta.reasoning_content }) + '\n')
                );
              }
            } catch {
              // Skip unparseable SSE data
            }
          }
        }
        controller.close();
      } catch (error) {
        console.error('OpenAI stream error:', error);
        controller.error(error);
      }
    },
  });

  return readableStream;
}

/**
 * Unified chat function that routes to the correct provider
 */
export async function chatWithProvider(
  providerConfig: LLMProviderConfig,
  ollamaModel: string,
  messages: { role: string; content: string }[],
  context?: string
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = providerConfig.systemPrompt || undefined;
  const thinkingEnabled = providerConfig.thinkingEnabled ?? true;

  if (providerConfig.provider === 'online' && providerConfig.openaiApiKey) {
    return chatWithOpenAI(
      providerConfig.openaiApiKey,
      messages,
      context,
      providerConfig.openaiModel || DEFAULT_OPENAI_MODEL,
      systemPrompt,
      thinkingEnabled
    );
  }

  // Default: use local Ollama
  return chatWithModel(ollamaModel, messages, context, systemPrompt, thinkingEnabled);
}

/**
 * Fetch API key from Google Drive
 */
export async function syncApiKeyFromGoogleDrive(): Promise<{ success: boolean; apiKey?: string; error?: string }> {
  const fileId = '16WrMjxOMw8lF3Kl6QJxYL6Wa1smtJd2b';
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  try {
    const res = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { success: false, error: `Error descargando archivo: ${res.status}` };
    }

    const text = await res.text();
    const apiKey = text.trim();

    // Basic validation - OpenAI keys start with 'sk-'
    if (!apiKey.startsWith('sk-')) {
      return { success: false, error: 'El contenido del archivo no parece ser una API key válida de OpenAI' };
    }

    return { success: true, apiKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return { success: false, error: `Error de conexión: ${message}` };
  }
}
