---
Task ID: 1
Agent: Main Agent
Task: Move model selection from collection creation to general configuration

Work Log:
- Analyzed current codebase structure: collection creation dialog had chat model and embedding model dropdowns, per-collection settings panel had model dropdowns
- Updated `src/lib/openai.ts`: Added `defaultChatModel` and `defaultEmbedModel` fields to `LLMProviderConfig` interface and defaults
- Updated `src/app/api/settings/llm-provider/route.ts`: GET/PUT handlers now include defaultChatModel and defaultEmbedModel, never exposes API key
- Updated `src/app/api/collections/route.ts`: Collection creation now reads global defaults from llm_provider_config; when provider is "online", uses openaiModel for chatModel
- Updated `src/app/api/collections/[id]/chat/route.ts`: Chat route uses global defaultChatModel for Ollama, global defaultEmbedModel for RAG embeddings
- Updated `src/app/api/collections/[id]/embed/route.ts`: Embed route uses global defaultEmbedModel
- Updated `src/app/page.tsx` frontend:
  - Removed `newCollectionChatModel` and `newCollectionEmbedModel` state variables
  - Added `defaultChatModel` and `defaultEmbedModel` state variables
  - Updated `fetchLlmProviderSettings` to load defaultChatModel/defaultEmbedModel
  - Updated `saveLlmProviderSettings` to include defaultChatModel/defaultEmbedModel parameters
  - Simplified collection creation dialog: only name + description + info box showing current global models
  - Updated LLM provider dialog (now "Configuración General"):
    - Added chat model dropdown (Ollama models) when Local provider selected
    - Added fixed OpenAI model display when Online provider selected
    - Added embedding model dropdown (always Ollama) for both providers
    - Added reconnect button for Ollama in local provider section
  - Replaced per-collection model dropdowns with read-only info display
  - Removed redundant "Modelos de Chat/Embeddings Disponibles" and "Conexión Ollama" sections from per-collection settings
  - Updated sidebar footer to show global model with provider icon
  - Updated chat model badge to use global config instead of collection's stored model
  - Removed unused `handleUpdateModel` function

Stage Summary:
- Model selection moved from collection creation to general configuration dialog
- Collection creation now auto-uses global default models
- When "Online" is selected: chat model = gpt-5.4-mini (fixed), embeddings = local Ollama model
- When "Local" is selected: both chat and embedding models selected from Ollama
- All backend routes (chat, embed, collection creation) use global defaults
- Per-collection settings panel shows read-only model info pointing to general config
- Lint passes clean, dev server compiles successfully

---
Task ID: 4
Agent: Main Agent
Task: Consolidate settings panels and ensure cascade deletion

Work Log:
- Consolidated settings: moved web search provider config, voice activation settings from per-collection panel to general settings dialog (⚙️ Configuración General)
- Per-collection settings panel now only contains the web search toggle (collection-specific)
- Per-collection panel renamed to "Configuración de Colección"
- Added note: "El proveedor de búsqueda se configura en ⚙️ Configuración General"
- Changed voice keyword default from "asistente HP" to "asistente" in:
  - `src/app/page.tsx` state default and fetch fallback
  - `src/app/api/settings/voice/route.ts` DEFAULT_VOICE_CONFIG
- Updated collection DELETE handler in `src/app/api/collections/[id]/route.ts` to explicitly delete in correct order:
  1. Embeddings (deepest child)
  2. ChatMessages
  3. Chunks
  4. Documents
  5. Collection itself
  This avoids potential SQLite cascade issues

Stage Summary:
- All global settings (LLM provider, models, system prompt, web search, voice) are now in one place: ⚙️ Configuración General
- Per-collection panel only has collection-specific settings (web search toggle)
- Voice keyword default is now "asistente"
- Collection deletion explicitly removes all related data in correct order (embeddings, messages, chunks, documents, then collection)
- Lint passes clean, dev server compiles successfully

---
Task ID: 2
Agent: Main Agent
Task: Add system prompt configuration to general settings

Work Log:
- Added `systemPrompt` field to `LLMProviderConfig` interface in `src/lib/openai.ts` with default empty string
- Updated `chatWithOpenAI()` to accept `customSystemPrompt` parameter: when provided, it replaces the default "You are a helpful AI assistant" prompt; context is still appended when available
- Updated `chatWithModel()` in `src/lib/ollama.ts` to accept `customSystemPrompt` parameter with same logic
- Updated `chatWithProvider()` to pass `providerConfig.systemPrompt` to both chat functions
- Updated `src/app/api/settings/llm-provider/route.ts`: GET and PUT now include `systemPrompt`, persisted in DB
- Updated `src/app/page.tsx`:
  - Added `systemPrompt` state variable
  - Updated `fetchLlmProviderSettings` to load systemPrompt from API
  - Updated `saveLlmProviderSettings` to accept and save `sysPrompt` parameter
  - Added System Prompt UI section in general settings dialog with Textarea, character count, and clear button
  - Updated API key clear button to include systemPrompt in request body

Stage Summary:
- System prompt can now be configured in ⚙️ Configuración General
- When empty, default prompt ("You are a helpful AI assistant") is used
- When set, custom prompt replaces default; RAG context is still appended if available
- Works for both Local (Ollama) and Online (OpenAI) providers
- Prompt is persisted in DB alongside other LLM provider settings
- Auto-saves on blur; has clear button to reset to default
- Lint passes clean, dev server compiles successfully

---
Task ID: 4
Agent: Main Agent
Task: Consolidate settings panels and ensure cascade deletion

Work Log:
- Consolidated settings: moved web search provider config, voice activation settings from per-collection panel to general settings dialog (⚙️ Configuración General)
- Per-collection settings panel now only contains the web search toggle (collection-specific)
- Per-collection panel renamed to "Configuración de Colección"
- Added note: "El proveedor de búsqueda se configura en ⚙️ Configuración General"
- Changed voice keyword default from "asistente HP" to "asistente" in:
  - `src/app/page.tsx` state default and fetch fallback
  - `src/app/api/settings/voice/route.ts` DEFAULT_VOICE_CONFIG
- Updated collection DELETE handler in `src/app/api/collections/[id]/route.ts` to explicitly delete in correct order:
  1. Embeddings (deepest child)
  2. ChatMessages
  3. Chunks
  4. Documents
  5. Collection itself
  This avoids potential SQLite cascade issues

Stage Summary:
- All global settings (LLM provider, models, system prompt, web search, voice) are now in one place: ⚙️ Configuración General
- Per-collection panel only has collection-specific settings (web search toggle)
- Voice keyword default is now "asistente"
- Collection deletion explicitly removes all related data in correct order (embeddings, messages, chunks, documents, then collection)
- Lint passes clean, dev server compiles successfully

---
Task ID: 3
Agent: Main Agent
Task: Add reset conversation button to collection chats

Work Log:
- Added DELETE endpoint to `src/app/api/collections/[id]/chat/route.ts`: deletes all ChatMessage records for a collection, returns deleted count
- Added reset button (Trash2 icon) in top bar of chat area in `src/app/page.tsx`
- Button appears only when a collection is selected
- Uses AlertDialog confirmation: "¿Estás seguro de que quieres eliminar todos los mensajes de esta colección?"
- On confirm: calls DELETE API, clears messages from Zustand store, refreshes collections to update message count
- Button styled with red hover color to indicate destructive action

Stage Summary:
- Users can now reset the conversation in any collection via the trash icon in the top bar
- Confirmation dialog prevents accidental deletion
- After reset, chat area shows empty state (welcome message)
- Collection sidebar updates message count to 0
- Lint passes clean, dev server compiles successfully

---
Task ID: 4
Agent: Main Agent
Task: Consolidate settings panels and ensure cascade deletion

Work Log:
- Consolidated settings: moved web search provider config, voice activation settings from per-collection panel to general settings dialog (⚙️ Configuración General)
- Per-collection settings panel now only contains the web search toggle (collection-specific)
- Per-collection panel renamed to "Configuración de Colección"
- Added note: "El proveedor de búsqueda se configura en ⚙️ Configuración General"
- Changed voice keyword default from "asistente HP" to "asistente" in:
  - `src/app/page.tsx` state default and fetch fallback
  - `src/app/api/settings/voice/route.ts` DEFAULT_VOICE_CONFIG
- Updated collection DELETE handler in `src/app/api/collections/[id]/route.ts` to explicitly delete in correct order:
  1. Embeddings (deepest child)
  2. ChatMessages
  3. Chunks
  4. Documents
  5. Collection itself
  This avoids potential SQLite cascade issues

Stage Summary:
- All global settings (LLM provider, models, system prompt, web search, voice) are now in one place: ⚙️ Configuración General
- Per-collection panel only has collection-specific settings (web search toggle)
- Voice keyword default is now "asistente"
- Collection deletion explicitly removes all related data in correct order (embeddings, messages, chunks, documents, then collection)
- Lint passes clean, dev server compiles successfully

---
Task ID: 5
Agent: Main Agent
Task: Fix reasoning model infinite loop (Qwen 3.5 self-correction loop)

Work Log:
- Analyzed the issue: Qwen 3.5 and similar reasoning models enter infinite "Wait..." self-correction loops during thinking, appearing stuck
- Added anti-loop instructions to system prompts in both ollama.ts and openai.ts
- Added num_predict option to Ollama API calls (8192 regular, 16384 reasoning models)
- Added max_tokens: 8192 to OpenAI API calls
- Added parsed.think and parsed.message?.think field handling in chat route
- Added backend reasoning loop detection: auto-truncates after 15 "Wait" patterns
- Added frontend loop detection: warns after 5+ Wait patterns with stop button
- Added AbortController support: red square stop button during streaming
- Handle AbortError gracefully in catch block

Stage Summary:
- Multi-layer approach to fix reasoning model infinite loops
- System prompt, token limits, backend detection, frontend detection, user stop button
- Also verified: keyword defaults to "asistente", cascade deletion works, API key never visible
- Lint passes clean, dev server compiles successfully

---
Task ID: 6
Agent: Main Agent
Task: Set HP specialist system prompt as the default system prompt in the application

Work Log:
- Replaced generic "You are a helpful AI assistant" default prompt with the comprehensive HP specialist prompt in both ollama.ts and openai.ts
- Extracted a shared `buildSystemPrompt()` function that handles all prompt composition logic:
  - If customSystemPrompt is provided and non-empty → it replaces the default HP prompt entirely
  - If no custom prompt → the default HP specialist prompt is used
  - RAG context is always appended when available (now labeled "CONTEXTO RAG RECUPERADO" in Spanish)
  - Anti-loop instructions are always appended for reasoning models
- Updated the System Prompt UI section in page.tsx:
  - Added "Usando prompt HP por defecto" badge when custom prompt is empty
  - Updated description to explain that custom prompt replaces the default entirely
  - Updated placeholder text to clarify the HP default is used when empty
  - Changed "Limpiar" button to "Restaurar HP por defecto" for clarity
  - Updated character count message: "Reemplaza el prompt HP por defecto" / "Vacío = Prompt especializado HP por defecto"

Stage Summary:
- The HP specialist system prompt is now the default for all chat interactions
- Covers: identity, RAG usage, brand rules, response style, security, uncertainty handling, format, and final objective
- Custom prompt (if set in settings) completely replaces the default HP prompt
- RAG context and anti-loop instructions are always automatically appended
- UI clearly communicates the default HP prompt is active when no custom prompt is set
- Lint passes clean, dev server compiles successfully

---
Task ID: 7
Agent: Main Agent
Task: Update default system prompt to versatile HP professional assistant

Work Log:
- Replaced the HP-product-only system prompt with the new versatile professional assistant prompt in both ollama.ts and openai.ts
- New prompt covers: identity as HP professional assistant, multi-topic RAG support (legal, dental, training, HR, etc.), professional topics handling, HP products as one of many capabilities, specialized topics disclaimers, security/conduct, style guidelines, uncertainty handling, recommended format, and final objective
- Key change: The assistant is no longer exclusively an HP products specialist — it can handle any professional topic based on the RAG collection context, while maintaining HP corporate identity
- UI badge still shows "Usando prompt HP por defecto" since the prompt still has HP identity

Stage Summary:
- Default system prompt updated to the versatile version that handles multiple professional topics
- Works with both Ollama (local) and OpenAI (online) providers
- RAG context and anti-loop instructions still auto-appended
- Lint passes clean, dev server compiles successfully
