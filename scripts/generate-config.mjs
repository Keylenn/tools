// Vercel 构建时生成 config.js：从环境变量读取上传接口配置。
// 本地开发不要运行本脚本，直接复制 config.example.js 为 config.js 并手动填写。
import { writeFileSync } from "node:fs";

const config = {
  upload: {
    api: (process.env.UPLOAD_API || "").trim() || "https://vercel.keylenn.top",
    token: (process.env.UPLOAD_TOKEN || "").trim(),
    dir: (process.env.UPLOAD_DIR || "").trim() || "uploads",
  },
};

const banner = [
  "// 由 Vercel 环境变量在构建时自动生成，请勿手动修改。",
  "// 本地开发：复制 config.example.js 为 config.js 并手动填写。",
].join("\n");

const target = new URL("../config.js", import.meta.url);
writeFileSync(target, `${banner}\nwindow.TOOLS_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log("config.js generated from Vercel environment variables");
