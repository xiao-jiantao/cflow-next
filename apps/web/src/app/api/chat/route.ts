import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { messages } = await request.json();

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "你是 cFlow AI 助手，负责帮助半导体设计工程师管理设计流程、查询知识文档、控制仿真任务。回答简洁专业。",
        },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return Response.json(
      { error: `DeepSeek API 错误: ${response.status}` },
      { status: 500 }
    );
  }

  const data = await response.json();
  const reply = data.choices[0].message.content;

  return Response.json({ reply });
}
