"use client";

import { useState, useEffect } from "react";

interface Doc {
  name: string;
  chunkCount: number;
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const fetchDocs = async () => {
    const res = await fetch("/api/docs");
    const data = await res.json();
    setDocs(data.docs || []);
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(`正在处理: ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/docs", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setMessage(data.message);
        fetchDocs();
      } else {
        setMessage(`错误: ${data.error}`);
      }
    } catch {
      setMessage("上传失败，请重试");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      <aside
        style={{
          width: 240, backgroundColor: "#fff",
          borderRight: "1px solid #e5e7eb", padding: 20,
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
          ].map((item, i) => (
            <a
              key={item.name}
              href={item.href}
              style={{
                display: "block", padding: "8px 12px", marginBottom: 4,
                borderRadius: 8, textDecoration: "none",
                backgroundColor: i === 1 ? "#eff6ff" : "transparent",
                color: i === 1 ? "#1d4ed8" : "#4b5563",
                fontWeight: i === 1 ? 600 : 400,
              }}
            >
              {item.name}
            </a>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 32, backgroundColor: "#f9fafb" }}>
        <h2 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 24 }}>
          知识库管理
        </h2>

        {/* 上传区域 */}
        <div
          style={{
            backgroundColor: "#fff", border: "2px dashed #d1d5db",
            borderRadius: 12, padding: 32, textAlign: "center",
            marginBottom: 24,
          }}
        >
          <p style={{ marginBottom: 12, color: "#6b7280" }}>
            上传文档（支持 PDF、Word、Excel）
          </p>
          <label
            style={{
              padding: "10px 24px", backgroundColor: "#2563eb",
              color: "#fff", borderRadius: 8, fontWeight: 600,
              cursor: uploading ? "not-allowed" : "pointer",
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading ? "处理中..." : "选择文件"}
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.md,.txt"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </label>
          {message && (
            <p style={{ marginTop: 12, color: "#059669", fontSize: 14 }}>
              {message}
            </p>
          )}
        </div>

        {/* 文档列表 */}
        <div style={{ backgroundColor: "#fff", borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            已入库文档 ({docs.length})
          </h3>
          {docs.length === 0 ? (
            <p style={{ color: "#9ca3af" }}>暂无文档，请上传</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: 8 }}>文档名称</th>
                  <th style={{ textAlign: "left", padding: 8 }}>片段数</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.name} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 8 }}>{doc.name}</td>
                    <td style={{ padding: 8, color: "#6b7280" }}>
                      {doc.chunkCount} 个片段
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}