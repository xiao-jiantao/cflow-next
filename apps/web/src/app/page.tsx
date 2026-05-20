"use client";

import { useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "你好！我是 cFlow AI 助手，可以帮你管理设计流程、查询知识文档。有什么可以帮你的？",
    },
  ]);
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: `收到你的消息："${input}"。AI 功能即将接入，敬请期待。`,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左侧面板 */}
      <aside className="w-64 bg-white border-r border-gray-200 p-4">
        <h1 className="text-xl font-bold text-gray-800 mb-6">cFlow AI</h1>
        <nav className="space-y-2">
          <a href="#" className="block px-3 py-2 rounded-lg bg-blue-50
            text-blue-700 font-medium">AI 对话</a>
          <a href="#" className="block px-3 py-2 rounded-lg text-gray-600
            hover:bg-gray-100">知识库</a>
          <a href="#" className="block px-3 py-2 rounded-lg text-gray-600
            hover:bg-gray-100">流程看板</a>
        </nav>
      </aside>

      {/* 主区域：对话 */}
      <main className="flex-1 flex flex-col">
        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-800"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* 输入框 */}
        <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
          <div className="flex gap-3 max-w-3xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息，例如：帮我查一下预仿真的SOP..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-blue-500
                focus:border-transparent"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-blue-600 text-white rounded-xl
                hover:bg-blue-700 transition-colors font-medium"
            >
              发送
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}