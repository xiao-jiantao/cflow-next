"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
}

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "你好！我是 cFlow AI 助手，可以帮你管理设计流程、查询知识文档。有什么可以帮你的？",
};

function createSession(): Session {
  return { id: Date.now().toString(), title: "新对话", messages: [WELCOME_MSG] };
}

const STORAGE_KEY = "cflow-sessions";

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([createSession()]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(-1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: Session[] = JSON.parse(saved);
        if (parsed.length > 0) {
          setSessions(parsed);
          setActiveId(parsed[parsed.length - 1].id);
          return;
        }
      } catch { /* ignore */ }
    }
    // 迁移旧格式数据
    const oldData = localStorage.getItem("cflow-chat-history");
    if (oldData) {
      try {
        const oldMsgs: Message[] = JSON.parse(oldData);
        if (oldMsgs.length > 0) {
          const migrated: Session = {
            id: "migrated",
            title: oldMsgs.find((m) => m.role === "user")?.content.slice(0, 20) || "历史对话",
            messages: oldMsgs,
          };
          setSessions([migrated]);
          setActiveId(migrated.id);
          localStorage.setItem(STORAGE_KEY, JSON.stringify([migrated]));
          localStorage.removeItem("cflow-chat-history");
          return;
        }
      } catch { /* ignore */ }
    }
    const first = createSession();
    setSessions([first]);
    setActiveId(first.id);
  }, []);

  const active = sessions.find((s) => s.id === activeId) || sessions[0];
  const messages = active?.messages || [WELCOME_MSG];

  const saveSessions = useCallback((updated: Session[]) => {
    setSessions(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const setMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    setSessions((prev) => {
      const next = prev.map((s) => {
        if (s.id !== activeId) return s;
        const newMsgs = typeof updater === "function" ? updater(s.messages) : updater;
        const title = newMsgs.find((m) => m.role === "user")?.content.slice(0, 20) || s.title;
        return { ...s, messages: newMsgs, title };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    setCurrentTurn(-1);
  };

  const getUserMsgIndices = () => {
    return messages.reduce<number[]>((acc, msg, i) => {
      if (msg.role === "user") acc.push(i);
      return acc;
    }, []);
  };

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

  useEffect(() => { scrollToBottom(); }, [activeId, messages.length]);

  const handleNewSession = () => {
    const s = createSession();
    const updated = [...sessions, s];
    saveSessions(updated);
    setActiveId(s.id);
  };

  const handleDeleteSession = (id: string) => {
    const updated = sessions.filter((s) => s.id !== id);
    if (updated.length === 0) {
      const s = createSession();
      saveSessions([s]);
      setActiveId(s.id);
    } else {
      saveSessions(updated);
      if (activeId === id) setActiveId(updated[updated.length - 1].id);
    }
  };

  const handleRenameSession = (id: string) => {
    if (!editTitle.trim()) { setEditingId(null); return; }
    const updated = sessions.map((s) =>
      s.id === id ? { ...s, title: editTitle.trim() } : s
    );
    saveSessions(updated);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const chatHistory = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory }),
      });

      const data = await res.json();
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply || "抱歉，出了点问题，请稍后再试。",
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "网络错误，请检查连接后重试。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      {/* 左侧导航 */}
      <aside
        style={{
          width: 240,
          backgroundColor: "#fff",
          borderRight: "1px solid #e5e7eb",
          padding: 20,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 24 }}>
          cFlow AI
        </h1>
        <nav>
          {[
            { name: "AI 对话", href: "/" },
            { name: "知识库", href: "/knowledge" },
            { name: "流程看板", href: "#" },
            { name: "使用手册", href: "/manual" },
          ].map((item, i) => (
            <a
              key={item.name}
              href={item.href}
              style={{
                display: "block",
                padding: "8px 12px",
                marginBottom: 4,
                borderRadius: 8,
                textDecoration: "none",
                backgroundColor: i === 0 ? "#eff6ff" : "transparent",
                color: i === 0 ? "#1d4ed8" : "#4b5563",
                cursor: "pointer",
                fontWeight: i === 0 ? 600 : 400,
              }}
            >
              {item.name}
            </a>
          ))}
        </nav>

        {/* 会话列表 */}
        <div style={{ marginTop: 20, borderTop: "1px solid #e5e7eb", paddingTop: 16, flex: 1, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>对话记录</span>
            <button onClick={handleNewSession} style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #d1d5db", borderRadius: 4, backgroundColor: "#fff", cursor: "pointer" }}>
              + 新建
            </button>
          </div>
          {[...sessions].reverse().map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
              style={{
                padding: "6px 10px",
                marginBottom: 2,
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
                backgroundColor: s.id === activeId ? "#eff6ff" : "transparent",
                color: s.id === activeId ? "#1d4ed8" : "#4b5563",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {editingId === s.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleRenameSession(s.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameSession(s.id); if (e.key === "Escape") setEditingId(null); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1, fontSize: 13, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 4px", outline: "none" }}
                />
              ) : (
                <span
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditTitle(s.title); }}
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
                >
                  {s.title}
                </span>
              )}
              {sessions.length > 1 && editingId !== s.id && (
                <span
                  onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                  style={{ color: "#d1d5db", cursor: "pointer", marginLeft: 4, fontSize: 14 }}
                  title="删除会话"
                >
                  x
                </span>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* 主区域 */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f9fafb",
        }}
      >
        {/* 消息列表 */}
        <div ref={chatContainerRef} style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              data-msg-index={idx}
              onClick={() => {
                const indices = getUserMsgIndices();
                if (msg.role === "user") {
                  setCurrentTurn(indices.indexOf(idx));
                } else {
                  const turn = indices.findIndex((ui) => ui > idx) - 1;
                  setCurrentTurn(turn >= 0 ? turn : indices.length - 1);
                }
              }}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 16,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  padding: "12px 16px",
                  borderRadius: 16,
                  backgroundColor: msg.role === "user" ? "#2563eb" : "#fff",
                  color: msg.role === "user" ? "#fff" : "#1f2937",
                  border:
                    msg.role === "assistant" ? "1px solid #e5e7eb" : "none",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 16,
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  color: "#9ca3af",
                }}
              >
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

        {/* 输入框 */}
        <form
          onSubmit={handleSubmit}
          style={{
            borderTop: "1px solid #e5e7eb",
            padding: 16,
            backgroundColor: "#fff",
          }}
        >
          <div
            style={{ display: "flex", gap: 12, maxWidth: 700, margin: "0 auto" }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息，例如：帮我查一下预仿真的SOP..."
              disabled={loading}
              style={{
                flex: 1,
                padding: "12px 16px",
                border: "1px solid #d1d5db",
                borderRadius: 12,
                fontSize: 14,
                outline: "none",
                opacity: loading ? 0.6 : 1,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "12px 24px",
                backgroundColor: loading ? "#93c5fd" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              发送
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
