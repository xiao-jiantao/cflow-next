import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 部署：产出自包含运行包 .next/standalone/，部署机无需联网装依赖，直接 node server.js
  output: "standalone",
  // monorepo 下必须指向仓库根，否则依赖文件追踪不全（standalone 包会缺 node_modules）
  outputFileTracingRoot: path.resolve(__dirname, "../../"),
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
};

export default nextConfig;
