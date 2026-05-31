# cflow-next

半导体设计流程管理系统，对接 Cadence Virtuoso EDA 环境。用 Next.js (TypeScript) 全栈重写原有 cFlowApp + cFlowWeb + cSim 三个系统，全部由 AI 编写和维护。

## 总体设计目标（最高优先级，所有决策的基准）

⚑ **核心目标**：AI 系统的使用效果要**逼近老板用 Claude Code 的效果**——LLM 能像 Claude Code 那样自由组合 virtuoso-bridge-lite 的 API 完成各种 EDA 任务。

⚑ **超越目标**：在对齐 Claude Code 能力的基础上，通过预注册 tool 和 workflow 实现 Claude Code 单独做不到的：
- **并发处理多个电路**（cFlow 服务端可同时管理多个 LLM 会话）
- **固化某些流程**（workflow tool 提供确定性结果）
- **减少 token 消耗**（高频操作沉淀为预注册 tool，避免每次让 LLM 写代码）
- **确定的结果**（zod schema 约束 + 流程固化）

**所有架构和实现决策必须先服务于这两个目标。**


## 项目结构

```
cflow-next/                   monorepo (pnpm workspace)
├── apps/web/                 Next.js 前端 + API routes
│   └── src/
│       ├── app/              pages: chat / knowledge / manual
│       │   └── api/          API routes (chat, tools)
│       └── lib/
│           ├── virtuoso-client.ts    TCP client → EDA daemon
│           ├── virtuoso-protocol.ts  STX/NAK 帧编解码
│           ├── embedding.ts          向量嵌入
│           ├── knowledge.ts          RAG 知识库
│           ├── python-bridge/        Python subprocess 管理（eval_python 后端）
│           ├── ai-tools/             Vercel AI SDK tool 定义（LLM 真正看到的）
│           │   ├── eval-python.ts    通路 A：LLM 写 Python 调 virtuoso-bridge
│           │   ├── atomic/           通路 B：预注册原子 tool（薄包装）
│           │   └── workflows/        通路 C：固化的多步业务流程
│           └── SKILLS/               给 LLM 的工具使用指南
├── docs/                     架构文档
├── package.json              root (pnpm --filter @cflow/web dev)
└── pnpm-workspace.yaml
```

## 架构（混合三通路，对齐 Claude Code 能力）

```
┌─ cflow-next Server (Next.js / TypeScript) ─────────────────────────────┐
│                                                                        │
│  LLM (Vercel AI SDK 6.x：DeepSeek / Claude，useChat→streamText)        │
│   │                                                                    │
│   ├─ Tool A: eval_python ──spawn──▶ Python subprocess                  │
│   │   (LLM 自由写 Python)             │ import virtuoso_bridge          │
│   │                                   │ 调用任意 113 API + A 类         │
│   │                                   ▼                                 │
│   │                                  TCP ──┐                            │
│   │                                         │                            │
│   ├─ Tool B: 预注册原子 tool ──▶ virtuoso-client.ts                    │
│   │   (zod schema + SKILL 模板)     (TCP STX/NAK)                       │
│   │   高频/确定性/省 token            │                                  │
│   │                                   ▼                                 │
│   │                                  TCP ──┤                            │
│   │                                         │                            │
│   └─ Tool C: workflow tool ──▶ 多步组合（含决策/轮询/分支）             │
│       固化业务流程,给出确定结果        │                                  │
│                                       ▼                                 │
│                                      TCP ──┤                            │
└─────────────────────────────────────────────┼──────────────────────────┘
                                              │ port 65433
                                              │ via SSH tunnel
                                              ▼
┌─ EDA Host (Linux) ─────────────────────────────────────────────────────┐
│  ramic_bridge_daemon.py ──stdin/stdout──▶ ramic_bridge.il (SKILL)      │
│  (~200 行,保留不重写)                       Cadence Virtuoso           │
│                                                                        │
│  + x11_dismiss_dialog.py (SSH 按需一次性触发,处理弹框)                  │
└────────────────────────────────────────────────────────────────────────┘
```

**三通路职责**：

| 通路 | 用什么 | 谁写代码 | 适用场景 |
|------|--------|---------|---------|
| A. eval_python | virtuoso-bridge-lite 全部 Python API | LLM 即时生成 Python | 探索性、低频、未预注册的操作（对齐 Claude Code） |
| B. 预注册原子 tool | zod schema + SKILL 模板 + `client.send()` | 我们预先写好（薄包装） | 高频操作（如 `fetch` 省 150 倍）、需要 schema 约束确定输出 |
| C. workflow tool | 多个 tool 组合 + 决策/轮询/分支 | 我们预先写好 | 固化的多步业务流程（`run_simulation`、`import_verilog`） |

## 关键决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2025-05-24 | 通信用 TCP STX/NAK 帧，不用 HTTP | SKILL 高频调用，4 字节头 vs HTTP 200-500 字节；EDA 在内网无法直连 HTTP |
| 2025-05-27 | EDA 端保留 .il + daemon + x11 helper | daemon 200 行极稳定，零收益重写；Virtuoso 只认 SKILL |
| 2025-05-27 | SSH 隧道短期手工 `ssh -L`，远期 Node `ssh2` | 单用户够用，多用户再自动化 |
| 2025-05-27 | dismiss_dialog 被动触发（SKILL 超时时 SSH 执行 x11 脚本） | 保留 GUI 给设计师，同时自动化不被弹框阻塞 |
| 2025-05-28 | ⚑ Decision C：混合三通路架构（eval_python + 预注册 tool + workflow） | 113 函数不需 TS 重写——eval_python 让 LLM 直接写 Python 调用 virtuoso-bridge-lite，对齐 Claude Code 能力 |
| 2025-05-28 | 不重写 virtuoso-bridge-lite 的 113 API 为 TS | eval_python 使其免费可用；重写 ROI 极低 |
| 2025-05-28 | 预注册 tool 仅做薄包装（zod + SKILL 模板 + send()） | 高频操作省 token（fetch 省 150 倍），不是完整重写 |
| 2025-05-28 | ~~系统端 100% TS~~ → TS 主体 + Python subprocess（eval_python） | eval_python 需要 Python 进程执行 LLM 生成的代码 |

## 已完成里程碑

| Tag | 日期 | 内容 |
|-----|------|------|
| v0.1.0 | 2025-05-22 | 基础框架：DeepSeek 对话、RAG 知识库、对话历史、向量持久化、多会话 |
| v0.2.0 | 2025-05-25 | TCP Client + Mock Server + Vercel AI SDK 6.x streaming + Function Calling |

## 当前迭代目标

**Phase 1: eval_python（解锁全部 113 API，对齐 Claude Code）** — 骨架已完成，待 Tier 3 端到端测试

| 任务 | 状态 |
|------|------|
| `eval-python.ts` — AI tool 定义（zod schema + execute） | ✅ 完成 |
| Python subprocess 管理（spawn / communicate / timeout / pool） | ✅ 完成 |
| 安全沙箱：限制 import、超时、输出截断 | ✅ 完成（timeout 30s, output 512KB） |
| SKILLS 文档：告诉 LLM 如何使用 eval_python + virtuoso-bridge API | ✅ 完成 |
| Tier 1 测试：PythonRunner 独立验证 | ✅ 通过 |
| Tier 2 测试：Python 环境 import virtuoso_bridge | ✅ 通过（v0.7.0） |
| Tier 3 测试：dev server 端到端 LLM 调用 | 待测试 |

**Phase 2: A 类 P0 预注册 tool（高频操作省 token）**

| 任务 | 状态 |
|------|------|
| `fetch` — batch 对象读取（薄包装：zod + SKILL 模板 + send） | 待实现 |
| `fetch_one` — 单对象读取 | 待实现 |
| `load_il` — 下发 SKILL helper 脚本 | 待实现 |
| `dismiss_dialog` — 弹框恢复 | 待实现 |

**Phase 3: workflow tool + 更多预注册 tool（超越 Claude Code）**

| 任务 | 状态 |
|------|------|
| `run_simulation` workflow | 待设计 |
| `import_verilog` workflow | 待设计 |
| 更多高频原子 tool（open_cell_view 等） | 待设计 |

## 代码约定

- monorepo: pnpm workspace，`pnpm --filter @cflow/web dev` 启动
- Node >= 18
- TypeScript strict
- 文件命名: kebab-case
- EDA 通信: 所有 SKILL 调用走 `VirtuosoClient.send(skillCode, timeout)`
- 环境变量: `VB_HOST` (default localhost), `VB_PORT` (default 65433)

## 测试与文档约定

每个含测试的 task 产出**两个文档**，都放 `D:\Workspace\gitRepo\ClaudeCodeDocs\`：

1. **task 主文档** `YYYYMMDD_taskN_标题.md` — 目标 / 决策背景 / 实施清单 / 核心代码结构 /
   测试结果**摘要表**（Tier × 结果）/ 遇到的问题 / Commit / 后续。测试只放结论表，
   详情引用测试报告。
2. **测试报告** `YYYYMMDD_taskN_测试报告.md` — 可复现的完整记录，供他人从零复现。

**测试报告每个 Tier 必含**：
- **目的**：这一层验证什么、为什么这么分层
- **前置条件**：要起哪些进程（dev server / mock-daemon）、装哪些依赖、端口要求、env
- **改动文件**：本次测试新增/修改的文件，**含临时文件**（如 `temp/` 下的测试脚本、请求体）
- **执行命令**：每条 cmd 的**原文 1:1**（含路径、flag、重定向）
- **真实输出**：命令的关键输出**原样粘贴**（不复述、不美化）
- **判定**：通过/失败，以及凭什么判定（看到哪个值）

**铁律——测试当下就留存输出，写报告时直接用，绝不事后重跑**：
- 跑测试时就把 stdout/stderr 存进 `temp/`（如 `temp/tierN_*.log`），报告引用它。
- 重跑是浪费（token/时间），且环境可能变了跑出不同结果，破坏"可复现"的可信度。
- Tier 3 这类要起服务的，更不允许为写报告重跑。
- 写报告 = 整理已留存的记录，不是重新执行测试。

**Windows 后台进程教训**：`pnpm dev` / `pnpm mock-daemon` 起的 `next dev` / `tsx` 子进程，
TaskStop 杀不掉（只杀 pnpm 父进程）。收尾必须 `netstat -ano | grep :PORT` 查 PID 再
`taskkill //PID <pid> //F`，否则遗留进程占端口导致下次启动失败。

## 日报约定

每天产出一份日报 `D:\Workspace\gitRepo\ClaudeCodeDocs\YYYY.MM.DD_日报.md`。

**不读昨天日报**：日报内容从**当天的 task 文档 + conversation-log** 拼装，不靠读前一份
日报对齐格式（读旧日报是 token 浪费）。格式照本节模板即可。

**固定结构**：
1. `# YYYY.MM.DD 日报`
2. `## 今日主题` — 一两句话点出主线
3. `## 主要工作与结论` — 按 task / 主题分小节，每节：问题 → 分析 → 结论/⚑决策。
   表格、代码、ASCII 图 1:1 保留（同 conversation-log 规则）
4. `## 今日产出文件` — 表格：文件路径 | 内容
5. `## 明日计划` — 表格或清单，标出依赖与优先级
6. `## 备注` — 遗留问题、安全提醒、未推送 commit 等

**何时写**：用户说"写日报"时写；一天多次可增量补充同一份。

## Session 与 token 约定

**核心原则：一个 task 一个 session，做完即归档后开新 session。** 这是省 token 最有效的
一条——长 session 是 token 黑洞：每多一轮，整段历史（所有代码、工具输出、讨论）都要重新
计入下一轮输入，越往后每轮越贵。项目初期"少 token 写很多代码"不是代码变便宜，是 session
短。task 文档 + conversation-log 就是为了让用户能安全开新 session 而不丢上下文。

**用户侧**：一个 task 做完、或话题切换时，新开 session。旧 session 的成果已落进 task 文档
/ 测试报告 / conversation-log，不丢。

**我（assistant）侧的固定动作**：新建 session 只有用户能做，我做不到。所以每当一个 task
完成且已归档（task 文档 / 测试报告 / 日报 / conversation-log 都落盘），**我必须主动提示
用户"现在是开新 session 的好时机"**，并先确认该存的都已存好（用户开新 session 不丢上下文）。
这是固定动作，不靠临场想起。

**我（assistant）侧的 token 纪律**（违反过，要真做到）：
- **同一文件只读一次**：读过的内容记住，不要 Read 全文 + cat + sed + 多次 offset 重复拉同一文件进上下文。
- **大文件局部读**：用 Grep / Read offset+limit 取需要的行，不全量读（曾为对齐格式读 259 行旧日报，纯浪费）。
- **不盲目大并行**：一次甩十几个调用，有依赖会互相取消，且取消的已跑部分照样计费、照样重复输出。
- **调试 dump 写文件再 grep**：大输出存 `temp/`，只 grep 关键行，不整段进上下文。
- **少返工**：想清楚再动手——序号、漏写、误删这类"做错→被指出→修"的循环，每次都把上下文再过一遍。

## 参考资料位置

| 内容 | 路径 |
|------|------|
| virtuoso-bridge-lite 源码 | `D:\Workspace\gitRepo\virtuoso-bridge-lite-main\` |
| 113 函数评估 + 3 个附录 | `D:\Workspace\gitRepo\ClaudeCodeDocs\2026.05.27.virtuoso-bridge-lite_into_tools.md` |
| 对话记录 | `D:\Workspace\gitRepo\ClaudeCodeDocs\conversation-log.md` |
| 日报 | `D:\Workspace\gitRepo\ClaudeCodeDocs\2026.MM.DD_日报.md` |
| 架构文档 | `D:\Workspace\gitRepo\cflow-next\docs\` |

## 安全规则

- GitHub fine-grained token 绝不写入任何文件，只在命令行一次性使用
- 不写入 .env、README、commit message 等任何被 git 跟踪的文件
- 不用 `git remote set-url` 持久化含 token 的 URL

## 工作空间地图 (D:\Workspace\gitRepo\)

```
gitRepo/
├── cflow-next/                    ★ 当前主项目（本仓库）
│   └── apps/web/src/lib/          核心：virtuoso-client.ts, virtuoso-protocol.ts
│
├── virtuoso-bridge-lite-main/     ★ Python 版 Virtuoso 访问工具（eval_python 运行时依赖 + 预注册 tool 参考）
│   ├── src/virtuoso_bridge/
│   │   ├── virtuoso/basic/bridge.py    VirtuosoClient 22 个核心方法
│   │   ├── virtuoso/schematic/         schematic 领域 API
│   │   ├── virtuoso/layout/            layout 领域 API
│   │   ├── virtuoso/maestro/           maestro 领域 API
│   │   ├── spectre/                    Spectre 仿真 + PSF ASCII 解析
│   │   ├── transport/ssh.py            SSH 执行器（多 profile、jump host）
│   │   ├── transport/tunnel.py         隧道生命周期管理
│   │   └── resources/                  ramic_bridge_daemon.py, x11_dismiss_dialog.py
│   ├── skills/                         AI agent 提示词（virtuoso/spectre/optimizer）
│   ├── examples/                       用法示例（import/harvest/screenshot 等）
│   └── tools/                          CLI 工具
│
├── skillbridge/                   对比参考（cFlow 原用的 Python Virtuoso 工具）
│   └── skillbridge/
│       ├── client/                客户端实现
│       └── server/                Virtuoso 端 SKILL server
│
├── ClaudeCodeDocs/                ★ 讨论纪要 / 分析文档 / 日报
│   ├── 2026.05.27.virtuoso-bridge-lite_into_tools.md   113 函数评估 + 3 附录
│   ├── 2026.MM.DD_日报.md         日报
│   ├── conversation-log.md        对话摘要记录
│   ├── scripts/verbatim.py        JSONL 对话提取工具
│   └── temp/                      中间文件（不删除）
│
├── cFlowApp/                      原 Java 版 cFlow（短期不用）
├── cFlowWeb/                      原 cFlow 前端（短期不用）
├── cSimApp/                       原 cSim（短期不用）
└── ...其他 cXxx 项目              短期不涉及
```

关键检索路径：
- 要看 Python 原实现某个方法 → `virtuoso-bridge-lite-main/src/virtuoso_bridge/`
- 要看 113 函数分级表 → `ClaudeCodeDocs/2026.05.27.virtuoso-bridge-lite_into_tools.md`
- 要对比 skillbridge 做法 → `skillbridge/skillbridge/client/`
- 要看当前 TS 实现 → `cflow-next/apps/web/src/lib/`
- 要看 LLM 用工具指南 → `cflow-next/apps/web/src/lib/SKILLS/`（待建）+ `virtuoso-bridge-lite-main/skills/`
