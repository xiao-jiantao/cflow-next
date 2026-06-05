# cflow-next

半导体设计流程管理系统,对接 Cadence Virtuoso EDA 环境。基于 **Next.js (TypeScript)** 全栈对接LLM API。内网私有化部署。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 框架 | Next.js（App Router）+ TypeScript strict |
| 运行时 | Node.js **>= 18**（部署机实测 v20.10.0 可用） |
| 包管理 | **pnpm**（monorepo / workspace） |
| 构建产物 | Next.js **standalone** 模式（自包含,部署机无需联网装依赖） |

## 仓库结构（monorepo）

```
cflow-next/
├── apps/web/              Next.js 前端 + API routes（主应用,包名 @cflow/web）
│   ├── next.config.ts     已开启 output:"standalone"
│   └── src/lib/           virtuoso-client / python-bridge / ai-tools 等核心
├── docs/                  架构文档
├── package.json           root（pnpm workspace 入口）
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

---

## 本地开发

```bash
pnpm install
pnpm dev          # = pnpm --filter @cflow/web dev,启动 http://localhost:3000
```

## 构建

```bash
pnpm install
pnpm build        # = pnpm --filter @cflow/web build
```

构建产物为 **standalone 自包含包**,位置:

```
apps/web/.next/standalone/      # 含精简版 node_modules,可独立运行
apps/web/.next/static/          # 静态资源(需一并部署,见下)
apps/web/public/                # 公共资源(需一并部署)
```

## 运行（部署机,只需 Node,无需 pnpm / 联网）

standalone 包的入口在 `apps/web/server.js`（因 monorepo 嵌套一层）。打包部署时需把三部分放到一起:

```
部署目录/
├── apps/web/server.js              # 入口（来自 standalone）
├── apps/web/.next/static/          # 从 apps/web/.next/static 拷入
└── apps/web/public/                # 从 apps/web/public 拷入
```

启动:

```bash
node apps/web/server.js            # 默认监听 0.0.0.0:3000,可用 PORT=xxxx 改端口
```

---

## 运行时环境变量

构建机和部署机都可能用到。建议放部署机的 `.env` 或进程管理器配置中（**不要提交进仓库**）:

| 变量 | 用途 | 默认 |
|------|------|------|
| `DEEPSEEK_API_KEY` | LLM(DeepSeek)调用 | 无,必填 |
| `SILICONFLOW_API_KEY` | 向量嵌入 | 无 |
| `VB_HOST` | EDA daemon 地址 | localhost |
| `VB_PORT` | EDA daemon 端口 | 65433 |
| `PYTHON_PATH` | eval_python 用的 Python 解释器 | 系统默认 |
| `VB_PYTHON_CWD` | Python 子进程工作目录 | 项目内 |
| `PORT` | 服务监听端口 | 3000 |

---

## 部署架构

代码托管在内网 GitLab（`192.168.0.44`）。GitLab 与部署机（`10.1.62.55`）**不在同一网段**,
因此**不使用 GitLab Runner**（注册不了）。改由**跨网段的 Jenkins** 负责构建与投递:

```
Windows 开发机           GitLab (192.168.0.44)      Jenkins (有外网)            10.1.62.55 (部署机)
     │                        │                          │                            │
     ├─ git push gitlab ────> │                          │                            │
     │                        │ ── 触发(webhook/轮询) ──>│                            │
     │                        │                          ├ pnpm install               │
     │                        │                          ├ pnpm build (standalone)    │
     │                        │                          ├ 打包 standalone+static+public
     │                        │                          └ scp ─────────────────────> │
     │                        │                                                       ├ 解包
     │                        │                                                       └ 重启服务(pm2)
```

- **部署机职责**:只运行,不构建。已确认装有 Node v20.10.0,无需 pnpm、无需联网。
- **进程守护**:用 pm2，装到 `cha00180` 用户目录,**不需要 root**（pm2 离线包由 Jenkins 中转安装）。
  开机自启（整机重启后自动拉起服务）为**可选项**,需 root 配一次,正式上线时再说,不阻塞当前链路。
- **分支**:仓库主分支为 `master`（与 GitHub 保持一致）。

---
