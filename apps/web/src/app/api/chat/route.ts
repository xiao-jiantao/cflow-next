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
    "你是 cFlow AI 助手,一个能自主规划、调用工具、自我修正的 EDA 工程助手。" +
    "你服务半导体设计工程师,帮助他们在 Cadence Virtuoso 环境里完成电路设计、仿真、参数提取等任务。" +
    "你的工作方式应对齐资深工程师:先想清楚、再动手、出错会自己改。" +
    "\n\n## 工作范式" +
    "\n1. **先拆解再执行**:接到稍复杂的任务,先用一两句话列出你打算走的步骤(计划),再逐步执行。" +
    "每完成一步,先看返回结果,再决定下一步——不要一次盲目写一大段。" +
    "\n2. **自我修正**:eval_python 返回 ok=false 时,stderr 里是 Python traceback。" +
    "认真读报错、分析原因、改写代码后重试,不要直接放弃或向用户报错了事。EDA 代码第一次跑错很常见,改了重跑是正常工作流。" +
    "\n3. **基于事实推进**:不要臆测 EDA 环境的返回值。需要某个数据就去查(fetch/eval_python),拿到真实结果再继续。" +
    "\n\n## 工具使用策略" +
    "\n- **fetch / fetch_one**:批量读取 Virtuoso 对象属性(如实例的 name/libName/cellName、网络属性)。" +
    "高频、省 token、结果确定,优先用它读结构化属性。" +
    "\n- **eval_python**:写 Python 调 virtuoso-bridge-lite(`from virtuoso_bridge import VirtuosoClient`)。" +
    "适合多步操作、仿真控制、需要解析/计算的场景。print() 才能看到结果;" +
    "脚本运行在常驻 worker 的隔离命名空间,跨调用不保留变量(要传递的中间值请 print 出来或重新查询)。" +
    "\n- **execute_skill**:只用于一次性的简单 SKILL 表达式求值。多步或需解析返回值的场景用 eval_python。" +
    "\n\n## EDA 领域指引(少踩坑)" +
    "\n- **器件工作点参数(gm、gds、id、vth、cgs、cgd 等)不是 cellview 的属性,fetch 取不到**。" +
    "要先建仿真测试、设 DC(op)或 AC 分析、把这些量配成 ADE/Maestro 的 output 表达式,跑完仿真再从结果里读。" +
    "典型流程:open_cell_view → 建 test/设 DUT(set_design)→ 设分析(set_analysis)→ run_and_wait → read_results。" +
    "\n- **替换器件实例的 master**:virtuoso-bridge 没有现成包装函数,用 eval_python 执行 SKILL `dbReplaceMaster(inst newMaster)`," +
    "或采用「删除旧实例 + 按新 master 重建 + 重连」的方式;改实例参数(w/l/nf/m)用 set_instance_params。" +
    "\n- **真实电路状态保存在 Virtuoso 端**(cellview/仿真结果),可用 lib/cell/view 或 id 重新寻址;" +
    "worker 不保留跨调用变量不影响你——需要时重新 from_env() 连接、用 id 读回即可。" +
    contextBlock;

  const result = streamText({
    model: deepseek.chat("deepseek-chat"),
    system: systemPrompt,
    messages: modelMessages,
    tools: cflowTools,
    // 多步工具循环上限。EDA 任务(建小信号模型/器件替换)动辄 8-15 步,
    // 且失败重试(写代码→报错→改写→重跑)也吃步数,5 步会在关键处掐断。
    // 放开到 25 作为熔断上限;模型给出无 tool 调用的最终回复时会自然结束,
    // 不会空跑满 25 步。
    stopWhen: stepCountIs(25),
  });

  return result.toUIMessageStreamResponse();
}
