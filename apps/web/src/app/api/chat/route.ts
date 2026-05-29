import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { searchDocuments, getTotalChunks } from "@/lib/knowledge";
import { tools as cflowTools } from "@/lib/ai-tools";

const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const modelMessages = await convertToModelMessages(messages);

  // Extract last user text for RAG search
  const lastUserMsg = [...modelMessages]
    .reverse()
    .find((m) => m.role === "user");
  let lastUserText = "";
  if (lastUserMsg) {
    const content = lastUserMsg.content;
    if (typeof content === "string") {
      lastUserText = content;
    } else if (Array.isArray(content)) {
      for (const p of content) {
        if (p.type === "text") {
          lastUserText += p.text;
        }
      }
    }
  }

  let contextBlock = "";
  if (getTotalChunks() > 0 && lastUserText) {
    const results = await searchDocuments(lastUserText, 3);
    if (results.length > 0 && results[0].score > 0.3) {
      const docContext = results
        .map((r) => `[来源: ${r.docName}]\n${r.content}`)
        .join("\n\n---\n\n");
      contextBlock =
        `\n\n以下是从知识库中检索到的相关内容：\n\n${docContext}\n\n如果检索内容与问题无关，请忽略。`;
    }
  }

  const systemPrompt =
    "你是 cFlow AI 助手,负责帮助半导体设计工程师管理设计流程、查询知识文档、控制仿真任务。回答简洁专业。" +
    "\n\n工具使用策略:" +
    "\n- execute_skill:执行简单 SKILL 表达式" +
    "\n- eval_python:写 Python 调 virtuoso-bridge-lite(import virtuoso_bridge),适合探索性、低频、多步操作。print() 才能看到结果" +
    contextBlock;

  const result = streamText({
    model: deepseek.chat("deepseek-chat"),
    system: systemPrompt,
    messages: modelMessages,
    tools: cflowTools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
