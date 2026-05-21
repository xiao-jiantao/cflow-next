import { NextRequest } from "next/server";
import { searchDocuments, getTotalChunks } from "@/lib/knowledge";

export async function POST(request: NextRequest) {
  const { messages } = await request.json();

  // 取最后一条用户消息用于检索
  const lastUserMsg = [...messages].reverse().find(
    (m: { role: string }) => m.role === "user"
  );

  // RAG 检索：如果知识库有内容，则搜索相关文档
  let contextBlock = "";
  if (getTotalChunks() > 0 && lastUserMsg) {
    const results = await searchDocuments(lastUserMsg.content, 3);
    if (results.length > 0 && results[0].score > 0.3) {
      const docContext = results
        .map((r) => `[来源: ${r.docName}]\n${r.content}`)
        .join("\n\n---\n\n");
      contextBlock = `\n\n以下是从知识库中检索到的相关内容，请基于这些内容回答用户问题：\n\n${docContext}\n\n如果检索内容与问题无关，请忽略并用你的知识回答。`;
    }
  }

  const systemPrompt =
    "你是 cFlow AI 助手，负责帮助半导体设计工程师管理设计流程、查询知识文档、控制仿真任务。回答简洁专业。" +
    contextBlock;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  if (!response.ok) {
    return Response.json(
      { error: `DeepSeek API 错误: ${response.status}` },
      { status: 500 }
    );
  }

  const data = await response.json();
  const reply = data.choices[0].message.content;

  return Response.json({ reply });
}
