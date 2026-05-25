"use client";

import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";

interface ChatPaneProps {
  sessionId: string;
  initialMessages?: UIMessage[];
  onMessagesChange?: (messages: UIMessage[]) => void;
}

export function ChatPane({
  sessionId,
  initialMessages,
  onMessagesChange,
}: ChatPaneProps) {
  const [input, setInput] = useState("");
  const [currentTurn, setCurrentTurn] = useState(-1);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastSavedRef = useRef<string>("");

  const { messages, sendMessage, status, stop } = useChat({
    id: sessionId,
    messages: initialMessages,
  });

  // Persist messages to parent — only when content actually changes
  useEffect(() => {
    if (messages.length === 0) return;
    const key = JSON.stringify(messages.map((m) => m.id + m.parts.length));
    if (key === lastSavedRef.current) return;
    lastSavedRef.current = key;
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    setCurrentTurn(-1);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);

  const isLoading = status === "submitted" || status === "streaming";

  const getUserMsgIndices = () =>
    messages.reduce<number[]>((acc, msg, i) => {
      if (msg.role === "user") acc.push(i);
      return acc;
    }, []);

  const jumpToTurn = (direction: "prev" | "next") => {
    const container = chatContainerRef.current;
    if (!container) return;
    const indices = getUserMsgIndices();
    if (indices.length === 0) return;

    let target: number;
    if (currentTurn === -1) {
      target = direction === "prev" ? indices.length - 1 : 0;
    } else {
      target = direction === "prev" ? currentTurn - 1 : currentTurn + 1;
    }
    if (target < 0) target = 0;
    if (target >= indices.length) { scrollToBottom(); return; }

    setCurrentTurn(target);
    const msgElements = container.querySelectorAll("[data-msg-index]");
    const el = msgElements[indices[target]] as HTMLElement;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <>
      <div ref={chatContainerRef} style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {messages.length === 0 && (
          <MessageBubble role="assistant" text="你好！我是 cFlow AI 助手，可以帮你管理设计流程、查询知识文档。有什么可以帮你的？" />
        )}
        {messages.map((msg, idx) => (
          <div key={msg.id} data-msg-index={idx} onClick={() => {
            const indices = getUserMsgIndices();
            if (msg.role === "user") {
              setCurrentTurn(indices.indexOf(idx));
            } else {
              const turn = indices.findIndex((ui) => ui > idx) - 1;
              setCurrentTurn(turn >= 0 ? turn : indices.length - 1);
            }
          }} style={{ cursor: "pointer" }}>
            {msg.parts.map((part, i) => {
              if (part.type === "text") {
                return <MessageBubble key={i} role={msg.role} text={part.text} />;
              }
              if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                return <ToolBubble key={i} part={part} />;
              }
              return null;
            })}
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderRadius: 16, backgroundColor: "#fff", border: "1px solid #e5e7eb", color: "#9ca3af" }}>
              思考中...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 对话轮次导航 */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #f3f4f6" }}>
        <button onClick={() => jumpToTurn("prev")} title="上一轮对话" style={{ padding: "4px 14px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6, backgroundColor: "#fff", cursor: "pointer", color: "#4b5563" }}>
          &#9650; 上一轮
        </button>
        <button onClick={() => jumpToTurn("next")} title="下一轮对话" style={{ padding: "4px 14px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6, backgroundColor: "#fff", cursor: "pointer", color: "#4b5563" }}>
          &#9660; 下一轮
        </button>
        <button onClick={scrollToBottom} title="回到最新" style={{ padding: "4px 14px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6, backgroundColor: "#fff", cursor: "pointer", color: "#4b5563" }}>
          &#8595; 最新
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ borderTop: "1px solid #e5e7eb", padding: 16, backgroundColor: "#fff" }}>
        <div style={{ display: "flex", gap: 12, maxWidth: 700, margin: "0 auto" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息，例如：帮我执行 (plus 1 2)..."
            disabled={isLoading}
            style={{ flex: 1, padding: "12px 16px", border: "1px solid #d1d5db", borderRadius: 12, fontSize: 14, outline: "none", opacity: isLoading ? 0.6 : 1 }}
          />
          {isLoading ? (
            <button type="button" onClick={() => stop()} style={{ padding: "12px 24px", backgroundColor: "#ef4444", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              停止
            </button>
          ) : (
            <button type="submit" style={{ padding: "12px 24px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              发送
            </button>
          )}
        </div>
      </form>
    </>
  );
}

function MessageBubble({ role, text }: { role: string; text: string }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: role === "user" ? "flex-end" : "flex-start",
      marginBottom: 16,
    }}>
      <div style={{
        maxWidth: "70%",
        padding: "12px 16px",
        borderRadius: 16,
        backgroundColor: role === "user" ? "#2563eb" : "#fff",
        color: role === "user" ? "#fff" : "#1f2937",
        border: role === "assistant" ? "1px solid #e5e7eb" : "none",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
      }}>
        {text}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ToolBubble({ part }: { part: any }) {
  const toolName = part.type.startsWith("tool-")
    ? part.type.slice(5)
    : part.toolName ?? "tool";
  const state = part.state;

  let label: string;
  let color: string;
  if (state === "output-available") {
    const output = typeof part.output === "string"
      ? part.output
      : JSON.stringify(part.output);
    label = `✓ ${toolName}: ${output}`;
    color = "#059669";
  } else if (state === "output-error") {
    label = `✗ ${toolName}: ${part.errorText}`;
    color = "#dc2626";
  } else {
    label = `\u{1F527} 调用 ${toolName}...`;
    color = "#6b7280";
  }

  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
      <div style={{
        padding: "6px 12px",
        borderRadius: 8,
        backgroundColor: "#f3f4f6",
        fontSize: 13,
        color,
        fontFamily: "monospace",
      }}>
        {label}
      </div>
    </div>
  );
}
