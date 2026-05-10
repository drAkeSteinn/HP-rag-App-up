/**
 * RAG (Retrieval-Augmented Generation) utilities
 * Handles document chunking, similarity search, and context building
 *
 * Chunking strategy:
 * - Markdown-aware: splits by ## headers first, keeping sections coherent
 * - Each chunk includes its section header for context
 * - Falls back to paragraph-based splitting for non-markdown text
 * - Default max chunk size: 1200 chars (good balance for embedding quality)
 */

/** Maximum chunk size in characters */
const DEFAULT_MAX_CHUNK_SIZE = 1200;
/** Overlap between chunks in characters */
const DEFAULT_OVERLAP = 200;
/** Minimum chunk size — smaller sections are merged with the next */
const MIN_CHUNK_SIZE = 100;

/**
 * Split text into markdown sections based on ## headers.
 * Returns an array of { header, content } objects.
 * Text before any ## header is included as an "intro" section.
 */
function splitByMarkdownSections(text: string): { header: string; content: string }[] {
  const sections: { header: string; content: string }[] = [];

  // Match ## headers (2 or more #) — but NOT single # which is often a title
  // We split on lines that start with 1-6 # followed by a space
  const headerRegex = /^(#{1,6})\s+(.+)$/gm;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const headerPositions: { index: number; header: string; level: number }[] = [];

  while ((match = headerRegex.exec(text)) !== null) {
    headerPositions.push({
      index: match.index,
      header: match[0].trim(),
      level: match[1].length,
    });
  }

  if (headerPositions.length === 0) {
    // No headers found — return entire text as one section
    return [{ header: '', content: text.trim() }];
  }

  // If there's text before the first header, capture it as intro
  if (headerPositions[0].index > 0) {
    const introContent = text.slice(0, headerPositions[0].index).trim();
    if (introContent) {
      sections.push({ header: '', content: introContent });
    }
  }

  // Build sections from header positions
  for (let i = 0; i < headerPositions.length; i++) {
    const startPos = headerPositions[i].index;
    const endPos = i + 1 < headerPositions.length
      ? headerPositions[i + 1].index
      : text.length;

    const sectionText = text.slice(startPos, endPos).trim();
    if (sectionText) {
      sections.push({
        header: headerPositions[i].header,
        content: sectionText,
      });
    }
  }

  return sections;
}

/**
 * Split a single section into chunks if it exceeds maxChunkSize.
 * Each sub-chunk includes the section header for context preservation.
 */
function chunkSection(
  section: { header: string; content: string },
  maxChunkSize: number,
  overlap: number
): string[] {
  const { header, content } = section;

  // If the section fits in one chunk, return it as-is
  if (content.length <= maxChunkSize) {
    return [content];
  }

  // Section is too long — split it into sub-chunks
  const chunks: string[] = [];

  // Remove the header from content for splitting (we'll re-add it)
  const bodyContent = header
    ? content.slice(header.length).trim()
    : content;

  // If including the header would exceed limit, we still include it
  const headerPrefix = header ? header + '\n\n' : '';
  const effectiveMaxChunk = maxChunkSize - headerPrefix.length;

  let start = 0;

  while (start < bodyContent.length) {
    let end = Math.min(start + effectiveMaxChunk, bodyContent.length);

    // Try to find a natural break point (paragraph break, then sentence)
    if (end < bodyContent.length) {
      // First try paragraph break (double newline)
      const lastDoubleNewline = bodyContent.lastIndexOf('\n\n', end);
      // Then try single newline
      const lastNewline = bodyContent.lastIndexOf('\n', end);
      // Then try period
      const lastPeriod = bodyContent.lastIndexOf('.', end);

      // Prefer paragraph break > newline > period
      let breakPoint = -1;
      if (lastDoubleNewline > start + effectiveMaxChunk * 0.3) {
        breakPoint = lastDoubleNewline;
      } else if (lastNewline > start + effectiveMaxChunk * 0.3) {
        breakPoint = lastNewline;
      } else if (lastPeriod > start + effectiveMaxChunk * 0.3) {
        breakPoint = lastPeriod;
      }

      if (breakPoint > start) {
        end = breakPoint + 1;
      }
    }

    const bodyChunk = bodyContent.slice(start, end).trim();
    if (bodyChunk.length > 0) {
      // Prepend header to each sub-chunk for context
      const fullChunk = headerPrefix + bodyChunk;
      chunks.push(fullChunk);
    }

    start = end - overlap;
    if (start <= 0 && chunks.length > 0) break; // avoid infinite loop
    if (start >= bodyContent.length) break;
    if (start <= (end - overlap) && chunks.length > 0) break; // safety
  }

  return chunks;
}

/**
 * Split plain text (no markdown headers) into overlapping chunks.
 * Uses paragraph and sentence boundaries for natural breaks.
 */
function chunkTextPlain(
  text: string,
  maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    // Try to find a natural break point
    if (end < text.length) {
      const lastDoubleNewline = text.lastIndexOf('\n\n', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const lastPeriod = text.lastIndexOf('.', end);

      let breakPoint = -1;
      if (lastDoubleNewline > start + maxChunkSize * 0.3) {
        breakPoint = lastDoubleNewline;
      } else if (lastNewline > start + maxChunkSize * 0.3) {
        breakPoint = lastNewline;
      } else if (lastPeriod > start + maxChunkSize * 0.3) {
        breakPoint = lastPeriod;
      }

      if (breakPoint > start) {
        end = breakPoint + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - overlap;
    if (start >= text.length) break;
    // Safety: ensure we make progress
    if (start <= end - maxChunkSize && chunks.length > 0) break;
  }

  return chunks;
}

/**
 * Merge small chunks with the next chunk to avoid tiny, low-value embeddings.
 */
function mergeSmallChunks(chunks: string[], minSize: number = MIN_CHUNK_SIZE): string[] {
  if (chunks.length <= 1) return chunks;

  const merged: string[] = [];
  let i = 0;

  while (i < chunks.length) {
    const current = chunks[i];

    // If this chunk is too small and there's a next chunk, merge them
    if (current.length < minSize && i + 1 < chunks.length) {
      merged.push(current + '\n\n' + chunks[i + 1]);
      i += 2;
    } else {
      merged.push(current);
      i += 1;
    }
  }

  return merged;
}

/**
 * Main chunking function — markdown-aware splitting.
 *
 * Strategy:
 * 1. Detect if text has markdown headers (## or similar)
 * 2. If yes: split by sections, chunk each section with header propagation
 * 3. If no: use paragraph/sentence-based splitting
 * 4. Merge tiny chunks to avoid low-value embeddings
 *
 * @param text The document text to chunk
 * @param maxChunkSize Maximum characters per chunk (default: 1200)
 * @param overlap Overlap characters between chunks (default: 200)
 * @returns Array of text chunks
 */
export function chunkText(
  text: string,
  maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): string[] {
  if (!text.trim()) return [];

  // Detect if text has markdown headers
  const hasMarkdownHeaders = /^#{1,6}\s+.+$/m.test(text);

  let chunks: string[];

  if (hasMarkdownHeaders) {
    // Markdown-aware path
    const sections = splitByMarkdownSections(text);
    const rawChunks: string[] = [];

    for (const section of sections) {
      const sectionChunks = chunkSection(section, maxChunkSize, overlap);
      rawChunks.push(...sectionChunks);
    }

    chunks = rawChunks;
  } else {
    // Plain text path
    chunks = chunkTextPlain(text, maxChunkSize, overlap);
  }

  // Merge tiny chunks
  chunks = mergeSmallChunks(chunks);

  return chunks;
}

/**
 * Get chunking statistics for a document (useful for UI display).
 */
export function getChunkStats(text: string): {
  totalChars: number;
  hasHeaders: boolean;
  headerCount: number;
  headers: string[];
  estimatedChunks: number;
} {
  const headerRegex = /^#{1,6}\s+(.+)$/gm;
  const headers: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(text)) !== null) {
    headers.push(match[1].trim());
  }

  const chunks = chunkText(text);

  return {
    totalChars: text.length,
    hasHeaders: headers.length > 0,
    headerCount: headers.length,
    headers,
    estimatedChunks: chunks.length,
  };
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Find the most similar chunks to a query vector
 */
export function findSimilarChunks(
  queryVector: number[],
  chunksWithVectors: { id: string; content: string; vector: number[]; documentName: string }[],
  topK: number = 5,
  minSimilarity: number = 0.3
): { id: string; content: string; similarity: number; documentName: string }[] {
  const similarities = chunksWithVectors.map(chunk => ({
    id: chunk.id,
    content: chunk.content,
    documentName: chunk.documentName,
    similarity: cosineSimilarity(queryVector, chunk.vector),
  }));

  // Sort by similarity descending
  similarities.sort((a, b) => b.similarity - a.similarity);

  // Filter by minimum similarity and return top K
  return similarities
    .filter(s => s.similarity >= minSimilarity)
    .slice(0, topK);
}

/**
 * Build context string from similar chunks
 */
export function buildContext(similarChunks: { content: string; documentName: string; similarity: number }[]): string {
  if (similarChunks.length === 0) {
    return '';
  }

  return similarChunks
    .map((chunk, i) => `[Source: ${chunk.documentName} (relevance: ${(chunk.similarity * 100).toFixed(1)}%)]\n${chunk.content}`)
    .join('\n\n---\n\n');
}

/**
 * Parse a vector from JSON string stored in database
 */
export function parseVector(vectorJson: string): number[] {
  try {
    return JSON.parse(vectorJson);
  } catch {
    return [];
  }
}

/**
 * Serialize a vector to JSON string for database storage
 */
export function serializeVector(vector: number[]): string {
  return JSON.stringify(vector);
}
