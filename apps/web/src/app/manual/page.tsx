"use client";

function K({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ backgroundColor: "#fef08a", padding: "1px 5px", borderRadius: 4, fontWeight: 500 }}>
      {children}
    </span>
  );
}

export default function ManualPage() {
  const sections = [
    {
      id: "chat",
      title: "1. AI 对话",
      content: (
        <>
          <p>首页即为 AI 对话界面，可向 cFlow AI 助手提问。</p>
          <h4 style={{ marginTop: 12, fontWeight: 600 }}>基本操作</h4>
          <ul style={{ paddingLeft: 20 }}>
            <li>在底部输入框输入问题，点击 <K>发送</K> 或按 <K>Enter</K> 键发送</li>
            <li>AI 回答以流式方式逐字显示（打字机效果），无需等待全部生成</li>
            <li>AI 会基于知识库文档和自身知识综合回答</li>
            <li>支持多轮对话，上下文自动保持</li>
            <li>对话历史自动保存，刷新或切换页面不会丢失</li>
            <li>回答生成中可点击 <K>停止</K> 按钮中断，已输出内容保留</li>
          </ul>
          <h4 style={{ marginTop: 12, fontWeight: 600 }}>EDA 工具调用</h4>
          <ul style={{ paddingLeft: 20 }}>
            <li>AI 可以执行 Virtuoso SKILL 代码，用于仿真、打开 cellview、查询设计数据等</li>
            <li>示例提问：&quot;帮我执行 SKILL 代码 (plus 1 2)&quot;</li>
            <li>工具调用过程会在对话中实时显示状态：</li>
            <li style={{ listStyle: "none", paddingLeft: 12 }}>
              <K>🔧 调用 execute_skill...</K> — 正在执行<br />
              <K>✓ execute_skill: 3</K> — 执行成功，显示结果<br />
              <K>✗ execute_skill: 错误信息</K> — 执行失败，显示原因
            </li>
            <li>工具执行完成后，AI 会用自然语言总结结果</li>
          </ul>
          <h4 style={{ marginTop: 12, fontWeight: 600 }}>对话导航</h4>
          <ul style={{ paddingLeft: 20 }}>
            <li>消息列表下方有三个导航按钮：<K>上一轮</K> / <K>下一轮</K> / <K>最新</K></li>
            <li>按"轮次"跳转（一轮 = 一条提问 + AI 回复）</li>
            <li>点击任意消息气泡可锚定当前位置，后续导航从此处开始</li>
            <li>新消息到达时自动滚动到底部</li>
          </ul>
          <h4 style={{ marginTop: 12, fontWeight: 600 }}>多会话管理</h4>
          <ul style={{ paddingLeft: 20 }}>
            <li>左侧"对话记录"区域显示所有历史会话</li>
            <li>点击 <K>+ 新建</K> 创建新对话</li>
            <li>点击会话名称切换到该对话</li>
            <li>双击会话名称可重命名</li>
            <li>点击会话右侧 <K>x</K> 删除该对话</li>
            <li>会话标题自动取第一条提问的前 20 个字</li>
          </ul>
        </>
      ),
    },
    {
      id: "knowledge",
      title: "2. 知识库",
      content: (
        <>
          <p>上传文档后，AI 对话时会自动检索相关内容作为回答依据。</p>
          <h4 style={{ marginTop: 12, fontWeight: 600 }}>上传文档</h4>
          <ul style={{ paddingLeft: 20 }}>
            <li>支持格式：PDF、Word（.doc/.docx）、Excel、Markdown、TXT</li>
            <li>点击 <K>选择文件</K> 按钮上传，系统自动完成：格式转换 → 文本分块 → 向量化索引</li>
            <li>上传成功后显示文档名和片段数</li>
          </ul>
          <h4 style={{ marginTop: 12, fontWeight: 600 }}>管理文档</h4>
          <ul style={{ paddingLeft: 20 }}>
            <li>文档列表显示已入库的所有文档及其片段数量</li>
            <li>点击 <K>删除</K> 按钮可移除文档（向量索引和文件同时删除）</li>
            <li>重新上传同名文档会自动覆盖旧版本</li>
          </ul>
          <h4 style={{ marginTop: 12, fontWeight: 600 }}>检索原理</h4>
          <ul style={{ paddingLeft: 20 }}>
            <li>文档被切分为约 500 字的片段，每个片段生成向量</li>
            <li>提问时，系统找到最相关的 3 个片段注入 AI 上下文</li>
            <li>AI 基于这些片段内容回答，确保答案有据可查</li>
          </ul>
        </>
      ),
    },
    {
      id: "kanban",
      title: "3. 流程看板",
      content: <p style={{ color: "#9ca3af" }}>即将开发，敬请期待。</p>,
    },
  ];

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
            { name: "使用手册", href: "/manual" },
          ].map((item, i) => (
            <a
              key={item.name}
              href={item.href}
              style={{
                display: "block", padding: "8px 12px", marginBottom: 4,
                borderRadius: 8, textDecoration: "none",
                backgroundColor: i === 3 ? "#eff6ff" : "transparent",
                color: i === 3 ? "#1d4ed8" : "#4b5563",
                fontWeight: i === 3 ? 600 : 400,
              }}
            >
              {item.name}
            </a>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 32, backgroundColor: "#f9fafb", overflowY: "auto" }}>
        <h2 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 24 }}>
          使用手册
        </h2>

        <div style={{ maxWidth: 720, lineHeight: 1.8 }}>
          {sections.map((s) => (
            <Section key={s.id} title={s.title}>{s.content}</Section>
          ))}
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32, padding: 20, backgroundColor: "#fff", borderRadius: 12, border: "1px solid #e5e7eb" }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{title}</h3>
      {children}
    </section>
  );
}