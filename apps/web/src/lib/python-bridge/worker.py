#!/usr/bin/env python3
"""cflow-next 常驻 Python worker(模式 A 无状态)。

与 TS 侧 PythonWorker 通过 stdin/stdout 行分隔 JSON 通信:
  请求(一行): {"id":N,"type":"exec","code":"...","maxOutput":524288}
              {"id":N,"type":"ping"}
  响应(一行): {"id":N,"ok":bool,"stdout":"...","stderr":"...","truncated":bool}
              {"id":N,"type":"pong"}

进程启动时 import 一次 virtuoso_bridge(后续所有 exec 共享进程级 import 缓存),
每次 exec 用全新命名空间 exec(code, {}) —— 跨调用不保留变量(模式 A)。
用 `python -u` 启动以保证 stdout 不缓冲、逐行即时可读。
"""
import sys
import io
import json
import traceback
import contextlib

# Windows 默认 stdout/stdin 编码为 cp1252,遇非 ASCII(如中文、特殊符号)会
# UnicodeEncodeError。强制 UTF-8,保证协议两端编码一致。Python 3.7+ 支持 reconfigure。
for _stream in (sys.stdin, sys.stdout):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover - 老版本/非 TextIO 兜底
        pass

# 启动即付一次 import(常驻的核心收益)。失败不致命:
# 仅 exec 含 import virtuoso_bridge 的代码时才会报错,worker 本身仍可服务。
try:
    import virtuoso_bridge  # noqa: F401
    _BRIDGE_IMPORT_ERR = None
except Exception as _e:  # pragma: no cover - 环境相关
    _BRIDGE_IMPORT_ERR = repr(_e)

DEFAULT_MAX_OUTPUT = 512 * 1024  # 512 KB,与 TS 侧默认一致


def _truncate(text, limit):
    """按字节上限截断(UTF-8 安全),返回 (text, truncated)。"""
    if limit is None or limit <= 0:
        return text, False
    encoded = text.encode("utf-8")
    if len(encoded) <= limit:
        return text, False
    # 截到 limit 字节,丢弃可能被切断的尾部多字节序列
    clipped = encoded[:limit].decode("utf-8", errors="ignore")
    return clipped, True


def _handle_exec(req):
    """执行一段 code(全新命名空间),返回响应 dict。"""
    code = req.get("code", "")
    max_output = req.get("maxOutput", DEFAULT_MAX_OUTPUT)
    out_buf, err_buf = io.StringIO(), io.StringIO()
    ok = True
    try:
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            exec(code, {})  # 模式 A:每次全新 globals,跨调用不保留
    except SystemExit:
        # 用户代码里的 sys.exit() 不应杀死常驻 worker
        err_buf.write("SystemExit caught (worker stays alive)\n")
        ok = False
    except BaseException:
        err_buf.write(traceback.format_exc())
        ok = False

    stdout, t1 = _truncate(out_buf.getvalue(), max_output)
    stderr, t2 = _truncate(err_buf.getvalue(), max_output)
    return {"ok": ok, "stdout": stdout, "stderr": stderr, "truncated": t1 or t2}


def _write(resp):
    sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:  # 逐行阻塞读;EOF(TS 关 stdin)时自然退出
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            _write({"id": None, "ok": False, "stdout": "",
                    "stderr": "bad request json: " + repr(e), "truncated": False})
            continue

        rid = req.get("id")
        rtype = req.get("type", "exec")
        if rtype == "ping":
            _write({"id": rid, "type": "pong", "bridgeImportError": _BRIDGE_IMPORT_ERR})
            continue
        resp = _handle_exec(req)
        resp["id"] = rid
        _write(resp)


if __name__ == "__main__":
    main()
