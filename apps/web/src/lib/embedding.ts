// embedding 端点走环境变量,本地与内网各注入一套:
//   本地 → 默认公网官方 https://api.siliconflow.cn/v1/embeddings
//   内网 → 公司 nginx 反代 http://siliconflow.chsemi.com/v1/embeddings
//          (内网无公网,网管用 nginx 把公网 siliconflow 反代成内网 http 域名)
const SILICONFLOW_API_URL =
  process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1/embeddings";
const EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-8B";

export async function getEmbedding(texts: string[]): Promise<number[][]> {
  const response = await fetch(SILICONFLOW_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
