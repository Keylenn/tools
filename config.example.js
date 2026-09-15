// 上传接口的「env」式配置。复制本文件为 config.js 并填入真实值，config.js 已被 .gitignore 忽略。
// 部署到 Vercel 时无需本文件：在 Vercel 设置 UPLOAD_API / UPLOAD_TOKEN / UPLOAD_DIR 环境变量，
// 构建阶段会由 scripts/generate-config.mjs 自动生成 config.js。
window.TOOLS_CONFIG = {
  upload: {
    api: "https://vercel.keylenn.top", // 上传接口域名（不含 /api/upload）
    token: "", // UPLOAD_AUTH_TOKEN
    dir: "uploads", // 默认存储目录
  },
};
