import { getEmbedding, cosineSimilarity } from "./embedding";

export interface DocChunk {
  id: string;
  docName: string;
  content: string;
  embedding: number[];
}

// 内存存储（后期可切换到 pgvector）
let chunks: DocChunk[] = [];

export function splitIntoChunks(text: string, chunkSize = 500, overlap = 50): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const result: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + para).length > chunkSize && current.length > 0) {
      result.push(current.trim());
      const words = current.split("");
      current = words.slice(-overlap).join("") + "\n\n" + para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result.filter((c) => c.length > 20);
}

export async function indexDocument(docName: string, content: string) {
  // 移除同名旧文档
  chunks = chunks.filter((c) => c.docName !== docName);

  const textChunks = splitIntoChunks(content);
  if (textChunks.length === 0) return 0;

  // 批量向量化（每批最多 10 个）
  const batchSize = 10;
  for (let i = 0; i < textChunks.length; i += batchSize) {
    const batch = textChunks.slice(i, i + batchSize);
    const embeddings = await getEmbedding(batch);

    for (let j = 0; j < batch.length; j++) {
      chunks.push({
        id: `${docName}-${i + j}`,
        docName,
        content: batch[j],
        embedding: embeddings[j],
      });
    }
  }
  return textChunks.length;
}

export async function searchDocuments(
  query: string,
  topK = 3
): Promise<{ content: string; docName: string; score: number }[]> {
  if (chunks.length === 0) return [];

  const [queryEmbedding] = await getEmbedding([query]);

  const scored = chunks.map((chunk) => ({
    content: chunk.content,
    docName: chunk.docName,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export function getIndexedDocs(): { name: string; chunkCount: number }[] {
  const docMap = new Map<string, number>();
  for (const chunk of chunks) {
    docMap.set(chunk.docName, (docMap.get(chunk.docName) || 0) + 1);
  }
  return Array.from(docMap.entries()).map(([name, chunkCount]) => ({
    name,
    chunkCount,
  }));
}

export function getTotalChunks(): number {
  return chunks.length;
}
