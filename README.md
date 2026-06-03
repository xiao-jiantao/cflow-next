# cflow-next

半导体设计流程管理系统,对接 Cadence Virtuoso EDA 环境。基于 **Next.js (TypeScript)** 全栈重写原 cFlowApp + cFlowWeb + cSim。内网私有化部署。

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
- **进程守护**:计划用 pm2（部署机不能联网,pm2 离线包由 Jenkins 中转安装）。
- **分支**:仓库主分支为 `master`（与 GitHub 保持一致）。

---

## ⚠️ 给运维/管理员:部署前需确认的事项

> 以下信息用于编写 `Jenkinsfile` 并打通部署链路。请逐条确认后反馈,**不清楚的可先标注**。

### 关于 Jenkins（构建机）

1. **Jenkins 能否访问外网 npm registry?**（构建要 `pnpm install` 拉依赖)
   —— 已知答复:能。如有变化请说明。
2. **Jenkins 上是否已装 pnpm?** 版本?
   —— 在 Jenkins 上跑 `pnpm -v` / `node -v`,把输出贴回。未装的话需先装(`npm i -g pnpm`)。
3. **Jenkins 如何被触发构建?**
   - (a) GitLab webhook 主动推（需 GitLab 能反向连到 Jenkins,且配 Webhook + token);或
   - (b) Jenkins 定时轮询 GitLab(SCM polling,适合网段隔离)。
   —— 请告知 GitLab → Jenkins 方向是否可达,以决定用哪种。

### 关于 Jenkins → 部署机（10.1.62.55）的投递

4. **Jenkins 能否 SSH 到 `10.1.62.55`?**
   —— 在 Jenkins 上执行 `ssh cha00180@10.1.62.55 'echo ok'` 验证能否连通。
5. **用哪个账号 / 凭据投递?** 建议用 `cha00180`(部署机现有账号)。
   —— 需在 Jenkins 配置该账号的 SSH 私钥凭据(免密)。请确认可提供。
6. **部署目录定在哪?** 建议 `/home/cha00180/apps/cflow-next`。
   —— 如有指定目录或权限限制,请说明。

### 关于部署机（10.1.62.55,运行机)

7. **进程守护用 pm2 可以吗?需要 root 协助两件事:**
   - `npm install -g pm2`（**本机不能联网**,pm2 离线包将由 Jenkins 传过来安装,届时给具体命令);
   - `pm2 startup systemd -u cha00180 --hp /home/cha00180`（开机自启,只需 root 跑一次)。
   —— 确认是否同意用 pm2 + root 能否配合这两步。若不便,可改用 systemd 或 nohup。
8. **服务对外端口?** 默认 3000(已确认当前空闲)。是否需改端口 / 是否要走反向代理(Nginx)对外?
9. **运行时环境变量**(见上表)的值由谁提供、放在哪?(尤其 `DEEPSEEK_API_KEY`)

### 网络连通性总览（请帮忙确认每条方向)

| 方向 | 是否可达 | 用途 |
|------|---------|------|
| 开发机 → GitLab(192.168.0.44) | ✅ 已通(VPN) | push 代码 |
| GitLab → Jenkins | ❓ 待确认 | webhook 触发(若用轮询则不需要) |
| Jenkins → 外网 npm | ✅ 已确认 | 拉依赖 |
| Jenkins → GitLab(192.168.0.44) | ❓ 待确认 | 拉代码 |
| Jenkins → 部署机(10.1.62.55) | ❓ 待确认 | scp 投递 + 远程重启 |

---

## 相关文档

- 架构与决策细节见 `CLAUDE.md` 与 `docs/`。
