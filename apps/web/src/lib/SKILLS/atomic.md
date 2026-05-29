# 预注册原子 tool

这些是高频 Virtuoso 操作的薄包装（zod schema + SKILL 模板 + send()）。
相比 eval_python，它们：

- **省 token**：LLM 不需要写 Python 代码
- **更确定**：zod schema 约束输出格式
- **更快**：直接 TCP 调用，没有 Python 启动开销

## 选择策略

| 任务 | 用什么 |
|------|--------|
| 批量读对象的多个 slot | `fetch` |
| 读单个对象的多个 slot | `fetch_one` |
| 执行任意 SKILL 字符串 | `execute_skill` |
| 上述都不合适 | `eval_python` |

## 何时升级

如果发现 LLM 反复用 `eval_python` 做同一件事 → 应该把它沉淀成预注册 tool。
