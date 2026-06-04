import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { indexDocument, getIndexedDocs, removeDocument } from "@/lib/knowledge";

const DOCS_DIR = path.join(process.cwd(), "../../docs");

function tryDelete(filePath: string) {
  try {
    unlinkSync(filePath);
  } catch {
    // Windows 下文件可能被占用，忽略删除失败
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未上传文件" }, { status: 400 });
    }

    // 保存上传文件到系统临时目录（避免占用问题）
    const buffer = Buffer.from(await file.arrayBuffer());
    const tmpPath = path.join(tmpdir(), "cflow_" + Date.now() + "_" + file.name);
    writeFileSync(tmpPath, buffer);

    // 用 MarkItDown 转换为 Markdown
    let mdContent: string;
    try {
      mdContent = execSync(`markitdown "${tmpPath}"`, {
        encoding: "utf-8",
        timeout: 60000,
      });
    } catch {
      tryDelete(tmpPath);
      return Response.json(
        { error: "文档转换失败，请检查文件格式" },
        { status: 500 }
      );
    }

    // 尝试删除临时文件（失败也不影响流程）
    tryDelete(tmpPath);

    // 保存 .md 到 docs 目录
    mkdirSync(DOCS_DIR, { recursive: true });
    const mdName = file.name.replace(/\.[^.]+$/, "") + ".md";
    const mdPath = path.join(DOCS_DIR, mdName);
    writeFileSync(mdPath, mdContent, "utf-8");

    // 向量化索引
    await indexDocument(mdName, mdContent);

    return Response.json({
      success: true,
      name: mdName,
      chunks: mdContent.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const docs = getIndexedDocs();
  return Response.json({ docs });
}

export async function DELETE(request: NextRequest) {
  const { name } = await request.json();
  if (!name) {
    return Response.json({ error: "缺少文档名称" }, { status: 400 });
  }
  removeDocument(name);
  const mdPath = path.join(DOCS_DIR, name);
  tryDelete(mdPath);
  return Response.json({ success: true });
}
