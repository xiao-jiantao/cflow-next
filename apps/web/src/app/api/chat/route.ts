import { streamText, convertToModelMessages, tool, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { searchDocuments, getTotalChunks } from "@/lib/knowledge";
import { virtuosoClient } from "@/lib/virtuoso-client";

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
    "你是 cFlow AI 助手，负责帮助半导体设计工程师管理设计流程、查询知识文档、控制仿真任务。回答简洁专业。" +
    "\n\n你可以使用 execute_skill 工具来执行 Virtuoso SKILL 代码。当用户要求执行仿真、打开 cellview、或进行 EDA 操作时，使用此工具。" +
    contextBlock;

  const result = streamText({
    model: deepseek.chat("deepseek-chat"),
    system: systemPrompt,
    messages: modelMessages,
    tools: {
      execute_skill: tool({
        description:
          "执行 Virtuoso SKILL 代码并返回结果。用于 EDA 操作如仿真、打开 cellview、查询设计数据等。也可用于简单计算。",
        inputSchema: z.object({
          code: z
            .string()
            .describe("要执行的 SKILL 代码，如 (plus 1 2) 或 hiOpenCellView(...)"),
        }),
        execute: async ({ code }: { code: string }) => {
          return await virtuosoClient().send(code);
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
