/**
 * RAG (Retrieval-Augmented Generation) utilities
 * Handles document chunking, similarity search, and context building
 */

/**
 * Split text into overlapping chunks
 */
export function chunkText(text: string, chunkSize: number = 500, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + chunkSize;
    
    // Try to find a natural break point (sentence or paragraph)
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > start + chunkSize * 0.5) {
        end = breakPoint + 1;
      }
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    start = end - overlap;
    if (start >= text.length) break;
  }
  
  return chunks;
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
