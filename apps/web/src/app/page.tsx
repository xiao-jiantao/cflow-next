"use client";

import { useState, useEffect, useCallback } from "react";
import { type UIMessage } from "ai";
import { ChatPane } from "./components/ChatPane";

interface Session {
  id: string;
  title: string;
  messages: UIMessage[];
}

const STORAGE_KEY = "cflow-sessions-v2";

function createSession(): Session {
  return { id: Date.now().toString(), title: "新对话", messages: [] };
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([createSession()]);
  const [activeId, setActiveId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

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
    const first = createSession();
    setSessions([first]);
    setActiveId(first.id);
  }, []);

  const active = sessions.find((s) => s.id === activeId) || sessions[0];

  const saveSessions = useCallback((updated: Session[]) => {
    setSessions(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

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

  const handleMessagesChange = useCallback((msgs: UIMessage[]) => {
    setSessions((prev) => {
      const next = prev.map((s) => {
        if (s.id !== activeId) return s;
        const firstUserText = msgs
          .find((m) => m.role === "user")
          ?.parts.find((p): p is { type: "text"; text: string } => p.type === "text")
          ?.text;
        const title = firstUserText?.slice(0, 20) || s.title;
        return { ...s, messages: msgs, title };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [activeId]);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      {/* 左侧导航 */}
      <aside style={{ width: 240, backgroundColor: "#fff", borderRight: "1px solid #e5e7eb", padding: 20, display: "flex", flexDirection: "column" }}>
        <h1 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 24 }}>cFlow AI</h1>
        <nav>
          {[
            { name: "AI 对话", href: "/" },
            { name: "知识库", href: "/knowledge" },
            { name: "流程看板", href: "#" },
            { name: "使用手册", href: "/manual" },
          ].map((item, i) => (
            <a key={item.name} href={item.href} style={{ display: "block", padding: "8px 12px", marginBottom: 4, borderRadius: 8, textDecoration: "none", backgroundColor: i === 0 ? "#eff6ff" : "transparent", color: i === 0 ? "#1d4ed8" : "#4b5563", cursor: "pointer", fontWeight: i === 0 ? 600 : 400 }}>
              {item.name}
            </a>
          ))}
        </nav>

        {/* 会话列表 */}
        <div style={{ marginTop: 20, borderTop: "1px solid #e5e7eb", paddingTop: 16, flex: 1, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>对话记录</span>
            <button onClick={handleNewSession} style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #d1d5db", borderRadius: 4, backgroundColor: "#fff", cursor: "pointer" }}>+ 新建</button>
          </div>
          {[...sessions].reverse().map((s) => (
            <div key={s.id} onClick={() => setActiveId(s.id)} style={{ padding: "6px 10px", marginBottom: 2, borderRadius: 6, fontSize: 13, cursor: "pointer", backgroundColor: s.id === activeId ? "#eff6ff" : "transparent", color: s.id === activeId ? "#1d4ed8" : "#4b5563", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {editingId === s.id ? (
                <input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={() => handleRenameSession(s.id)} onKeyDown={(e) => { if (e.key === "Enter") handleRenameSession(s.id); if (e.key === "Escape") setEditingId(null); }} onClick={(e) => e.stopPropagation()} style={{ flex: 1, fontSize: 13, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 4px", outline: "none" }} />
              ) : (
                <span onDoubleClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditTitle(s.title); }} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.title}</span>
              )}
              {sessions.length > 1 && editingId !== s.id && (
                <span onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }} style={{ color: "#d1d5db", cursor: "pointer", marginLeft: 4, fontSize: 14 }} title="删除会话">x</span>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* 主区域 */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#f9fafb" }}>
        <ChatPane
          key={activeId}
          sessionId={activeId}
          initialMessages={active?.messages}
          onMessagesChange={handleMessagesChange}
        />
      </main>
    </div>
  );
}