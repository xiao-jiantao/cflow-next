# eval_python — LLM 写 Python 调用 virtuoso-bridge-lite

## 何时用

- 探索性任务：你不确定该怎么做、需要先看一眼数据
- 低频任务：没有预注册 tool 的操作
- 复杂组合：多步操作之间需要 Python 中间变量传递结果

## 何时不要用

- 高频原子操作（用预注册 tool，省 token + 更确定）
- 固化的业务流程（用 workflow tool）

## 用法

```python
from virtuoso_bridge import VirtuosoClient
client = VirtuosoClient.from_env()

# 例1: 列出库里所有 cell
cells = client.fetch('ddGetObj("myLib")~>cells', ["name", "cellViews"])
print(cells)

# 例2: 打开 cellview 并读取实例
client.open_cell_view("myLib", "myCell", "schematic")
cv = client.fetch_one("hiGetCurrentWindow()->cellView", ["instances"])
print(cv)
```

## 注意

- 只有 `print()` 的内容会回传，最后表达式的值不会自动输出
- 子进程隔离：每次调用都是新 Python，**不能跨调用保留变量**
- 超时默认 30 秒；可通过 `timeoutSec` 调整
- 长输出会被截断到 512KB

## 可用 API

详见 `virtuoso-bridge-lite-main/skills/virtuoso/SKILL.md`。
113 个领域函数 + A 类 22 个控制面方法都可用。
