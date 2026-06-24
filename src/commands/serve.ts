/**
 * serve 命令 — 启动 Web 界面
 *
 * 用法: logstash serve [--port 3000]
 *
 * 设计目的:
 * - 提供 HTML 可视化界面，替代 CLI 操作
 * - REST API 供前端调用，未来也可供外部系统集成
 * - 用户在浏览器中完成所有操作：添加/搜索/查看/管理
 */

import { Command } from "commander";
import express from "express";
import multer from "multer";
import { resolve, dirname, sep as pathSep } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";
import { findStashRoot } from "../core/stash.js";

// ESM 模式下 __dirname 不可用，通过 import.meta.url 推导
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { createEntry, readEntry, updateEntry, deleteEntry } from "../core/entry.js";
import { readIndex } from "../core/index-manager.js";
import { search, type SearchCriteria } from "../search/engine.js";
import { searchInverted, readInvertedIndex } from "../search/inverted-index.js";
import { error } from "../utils/cli.js";

/** 安全的 parseInt，NaN 时返回默认值 */
function safeParseInt(val: string | undefined, defaultVal: number): number {
  if (!val) return defaultVal;
  const n = parseInt(val, 10);
  return isNaN(n) || n < 0 ? defaultVal : n;
}

export function serveCommand(program: Command): void {
  program
    .command("serve")
    .description("启动 Web 界面（在浏览器中管理压测日志）")
    .option("-p, --port <number>", "监听端口", "3000")
    .action(async (options) => {
      const port = parseInt(options.port) || 3000;

      // 查找或自动初始化 stash 根目录
      let stashRoot = await findStashRoot(process.cwd());
      if (!stashRoot) {
        // 自动初始化：在当前目录创建 stash
        const { initStash } = await import("../core/stash.js");
        const cwd = process.cwd();
        const { success: cliSuccess, info: cliInfo } = await import("../utils/cli.js");
        cliInfo(`未找到 stash，自动初始化: ${cwd}`);
        const result = await initStash(cwd, "");
        for (const p of result.created) cliSuccess(`创建: ${p}`);
        stashRoot = cwd;
      }

      const app = express();

      // ========================================
      // 中间件
      // ========================================

      // JSON 解析
      app.use(express.json({ limit: "10mb" }));

      // 文件上传 — 保留原始文件名，带安全限制
      const uploadDir = resolve(stashRoot, ".logstash", "uploads");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(uploadDir, { recursive: true });

      // 允许的文件扩展名（白名单 — 覆盖压测目录常见文件类型）
      const ALLOWED_EXTENSIONS = [
        // 日志/文本
        ".log", ".txt", ".out", ".csv", ".json", ".xml", ".yaml", ".yml",
        // 配置文件
        ".ini", ".cfg", ".conf", ".env", ".toml", ".properties",
        ".gitignore", ".gitattributes",
        // 脚本（测试目录常见辅助脚本）
        ".py", ".sh", ".bat", ".cmd", ".ps1",
        // 代码/头文件
        ".c", ".h", ".cpp", ".hpp", ".rs", ".go",
        // 抓包
        ".pcap", ".pcapng", ".cap",
        // 图片
        ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".svg", ".webp",
        // 文档
        ".md", ".html", ".htm", ".pdf", ".doc", ".docx", ".xls", ".xlsx",
        // 压缩包
        ".zip", ".tar", ".tar.gz", ".tar.bz2", ".tar.xz", ".gz", ".bz2", ".xz", ".7z",
        // 二进制/固件
        ".bin", ".hex", ".elf", ".img",
        // 数据库
        ".db", ".sqlite", ".sqlite3",
      ];

      const storage = multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
          const timestamp = Date.now();
          // 安全净化文件名：移除路径分隔符、空字节、控制字符
          let originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
          // 移除路径遍历字符
          originalName = originalName.replace(/[/\\]/g, "_");
          // 移除空字节和控制字符
          originalName = originalName.replace(/[\x00-\x1f\x7f]/g, "");
          // 限制文件名长度
          if (originalName.length > 200) {
            const ext = originalName.lastIndexOf(".");
            const suffix = ext > 0 ? originalName.slice(ext) : "";
            originalName = originalName.slice(0, 200 - suffix.length) + suffix;
          }
          cb(null, `${timestamp}_${originalName}`);
        },
      });
      const upload = multer({
        storage,
        limits: {
          fileSize: 500 * 1024 * 1024, // 单文件 500MB
          files: 500,                    // 最多 500 个文件
        },
        fileFilter: (_req, file, cb) => {
          // 白名单检查：匹配完整的后缀（包括复合后缀如 .tar.gz）
          const nameLower = file.originalname.toLowerCase();
          const matched = ALLOWED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
          if (matched) {
            cb(null, true);
          } else {
            cb(new Error(`不支持的文件类型: ${file.originalname}。允许的类型: ${ALLOWED_EXTENSIONS.join(", ")}`));
          }
        },
      });

      // 静态文件 — web 目录
      const webDir = resolve(__dirname, "..", "..", "web");
      app.use(express.static(webDir));

      // ========================================
      // REST API
      // ========================================

      // GET /api/stats — 仪表盘统计
      app.get("/api/stats", async (_req, res) => {
        try {
          const index = await readIndex(stashRoot);
          res.json({
            total: index.counts.total,
            byProject: index.counts.byProject,
            byTestType: index.counts.byTestType,
            byStatus: index.counts.byStatus,
            lastUpdated: index.lastUpdated,
          });
        } catch (err: any) {
          console.error("[API Error]", err instanceof Error ? err.message : String(err));
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // GET /api/entries — 列出条目
      app.get("/api/entries", async (req, res) => {
        try {
          const index = await readIndex(stashRoot);
          const criteria: SearchCriteria = {
            query: req.query.q as string | undefined,
            project: req.query.project as string | undefined,
            testType: req.query.type as string | undefined,
            status: req.query.status as SearchCriteria["status"],
            since: req.query.since as string | undefined,
            until: req.query.until as string | undefined,
            limit: safeParseInt(req.query.limit as string, 50),
            offset: safeParseInt(req.query.offset as string, 0),
          };

          if (req.query.tag) {
            criteria.tags = (req.query.tag as string).split(",");
          }

          // 如果指定了 fulltext
          if (req.query.fulltext === "1" && criteria.query) {
            const invIndex = await readInvertedIndex(stashRoot);
            const results = searchInverted(invIndex, criteria.query);
            const ids = results.map((r) => r.entryId);
            // 过滤主索引中的条目
            const entries = ids
              .map((id) => index.entries[id])
              .filter(Boolean);
            res.json({ entries, total: entries.length });
            return;
          }

          const result = search(index, criteria);
          res.json(result);
        } catch (err: any) {
          console.error("[API Error]", err instanceof Error ? err.message : String(err));
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // GET /api/entries/:id — 查看详情
      app.get("/api/entries/:id", async (req, res) => {
        try {
          const entry = await readEntry(stashRoot, req.params.id);
          if (!entry) {
            res.status(404).json({ error: "条目不存在" });
            return;
          }
          res.json(entry);
        } catch (err: any) {
          console.error("[API Error]", err instanceof Error ? err.message : String(err));
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // POST /api/entries — 创建条目（支持文件上传 + 文件夹上传）
      app.post("/api/entries", upload.array("files", 500), async (req, res) => {
        try {
          const body = req.body;
          const files = req.files as Express.Multer.File[] | undefined;

          // 解析文件夹相对路径（前端传的 JSON 数组，与 files 一一对应）
          let relativePaths: string[] = [];
          if (body.relativePaths) {
            try {
              relativePaths = JSON.parse(body.relativePaths);
            } catch { /* ignore */ }
          }

          // 构建文件路径列表
          const filePaths: string[] = [];
          if (files) {
            for (const f of files) {
              filePaths.push(f.path);
            }
          }

          // 解析 tags
          let tags: string[] = [];
          if (body.tags) {
            tags = typeof body.tags === "string"
              ? body.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
              : body.tags;
          }

          // 解析 JSON 字段
          let environment = {};
          let results = {};
          try {
            if (body.environment) environment = JSON.parse(body.environment);
            if (body.results) results = JSON.parse(body.results);
          } catch {
            res.status(400).json({ error: "环境参数或测试结果 JSON 格式无效" });
            return;
          }

          const entry = await createEntry(stashRoot, {
            title: body.title || "未命名测试",
            project: body.project || "default",
            testType: body.testType || "other",
            tester: body.tester || "",
            tags,
            description: body.description || "",
            status: body.status || "completed",
            environment,
            results,
            files: filePaths,
            fileMode: "move",
          });

          // 文件夹上传：保留子目录结构
          if (relativePaths.length > 0 && files && relativePaths.length === files.length) {
            const { rename, mkdir } = await import("node:fs/promises");
            const entryFilesDir = resolve(stashRoot, "entries", entry.id, "files");
            for (let i = 0; i < files.length; i++) {
              const relPath = relativePaths[i];
              if (!relPath || relPath === ".") continue; // 根目录文件不动

              // 安全检查：拒绝路径遍历
              if (relPath.includes("..") || relPath.includes("\\")) continue;

              const targetDir = resolve(entryFilesDir, relPath);
              await mkdir(targetDir, { recursive: true });
              const targetPath = resolve(targetDir, entry.files[i].name);
              const sourcePath = resolve(stashRoot, "entries", entry.id, entry.files[i].path);
              await rename(sourcePath, targetPath);

              // 更新 entry.files[i] 的 path
              const newRelPath = `files/${relPath}/${entry.files[i].name}`;
              entry.files[i].path = newRelPath;
            }
            // 写回更新后的 metadata
            const { writeFile } = await import("node:fs/promises");
            const { serializeEntry } = await import("../core/metadata.js");
            const metadataPath = resolve(stashRoot, "entries", entry.id, "metadata.json");
            await writeFile(metadataPath, serializeEntry(entry), "utf-8");
          }

          // 入库后清理原始文件（仅当用户勾选时）
          const deleted: string[] = [];
          if (body.cleanupOriginals === "1" && files && files.length > 0) {
            const { unlink } = await import("node:fs/promises");
            for (const f of files) {
              // 从 multer 时间戳文件名还原原始文件名
              const uploadedName = f.originalname;
              // 在当前目录中查找同名文件
              const targetPath = resolve(stashRoot, uploadedName);
              try {
                const { stat: fsStat } = await import("node:fs/promises");
                await fsStat(targetPath); // 检查是否存在
                await unlink(targetPath);
                deleted.push(uploadedName);
              } catch {
                // 文件不存在或无法删除，跳过
              }
            }
            if (deleted.length > 0) {
              console.log(`[cleanup] 已删除 ${deleted.length} 个原始文件: ${deleted.join(", ")}`);
            }
          }

          res.status(201).json({ ...entry, _cleaned: deleted || [] });
        } catch (err: any) {
          console.error("[API Error]", err instanceof Error ? err.message : String(err));
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // PATCH /api/entries/:id/files/:filename/key — 切换文件的关键标记
      app.patch("/api/entries/:id/files/:filename/key", async (req, res) => {
        try {
          const entry = await readEntry(stashRoot, req.params.id);
          if (!entry) {
            res.status(404).json({ error: "条目不存在" });
            return;
          }
          const file = entry.files.find((f) => f.name === req.params.filename);
          if (!file) {
            res.status(404).json({ error: "文件不存在" });
            return;
          }
          file.key = !file.key;
          entry.updatedAt = new Date().toISOString();

          const { writeFile } = await import("node:fs/promises");
          const { serializeEntry } = await import("../core/metadata.js");
          const metadataPath = resolve(stashRoot, "entries", req.params.id, "metadata.json");
          await writeFile(metadataPath, serializeEntry(entry), "utf-8");

          // 更新索引
          const { upsertIndex } = await import("../core/index-manager.js");
          await upsertIndex(stashRoot, entry);

          res.json({ filename: file.name, key: file.key });
        } catch (err: any) {
          console.error("[API Error]", err instanceof Error ? err.message : String(err));
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // PUT /api/entries/:id — 更新条目
      app.put("/api/entries/:id", async (req, res) => {
        try {
          const updates = req.body;

          // 解析 tags
          if (typeof updates.tags === "string") {
            updates.tags = updates.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
          }

          const entry = await updateEntry(stashRoot, req.params.id, updates);

          if (!entry) {
            res.status(404).json({ error: "条目不存在" });
            return;
          }

          res.json(entry);
        } catch (err: any) {
          console.error("[API Error]", err instanceof Error ? err.message : String(err));
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // DELETE /api/entries/:id — 删除条目
      app.delete("/api/entries/:id", async (req, res) => {
        try {
          const entry = await deleteEntry(stashRoot, req.params.id);
          if (!entry) {
            res.status(404).json({ error: "条目不存在" });
            return;
          }
          res.json({ deleted: entry.id });
        } catch (err: any) {
          console.error("[API Error]", err instanceof Error ? err.message : String(err));
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // GET /api/projects — 项目列表
      app.get("/api/projects", async (_req, res) => {
        try {
          const index = await readIndex(stashRoot);
          const projects = [...new Set(Object.values(index.entries).map((e) => e.project))].sort();
          res.json(projects);
        } catch (err: any) {
          console.error("[API Error]", err instanceof Error ? err.message : String(err));
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // GET /api/tags — 标签列表
      app.get("/api/tags", async (_req, res) => {
        try {
          const { readTags } = await import("../core/index-manager.js");
          const tags = await readTags(stashRoot);
          res.json(tags);
        } catch (err: any) {
          console.error("[API Error]", err instanceof Error ? err.message : String(err));
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // GET /api/entries/:id/files/:filename — 下载/预览文件
      app.get("/api/entries/:id/files/:filename", async (req, res) => {
        try {
          const entry = await readEntry(stashRoot, req.params.id);
          if (!entry) {
            res.status(404).json({ error: "条目不存在" });
            return;
          }

          const file = entry.files.find((f) => f.name === req.params.filename);
          if (!file) {
            res.status(404).json({ error: "文件不存在" });
            return;
          }

          // 安全检查：拒绝路径遍历序列
          if (file.path.includes("..")) {
            res.status(400).json({ error: "文件路径无效" });
            return;
          }

          const filePath = resolve(stashRoot, "entries", req.params.id, file.path);
          // 安全检查：确保解析后的路径在 entry 目录内（防路径遍历）
          const expectedDir = resolve(stashRoot, "entries", req.params.id);
          if (!filePath.startsWith(expectedDir + pathSep) && filePath !== expectedDir) {
            res.status(400).json({ error: "文件路径无效" });
            return;
          }

          res.setHeader("Content-Type", file.mimeType);
          res.setHeader("Content-Disposition", `inline; filename="${file.name}"`);
          createReadStream(filePath).pipe(res);
        } catch (err: any) {
          res.status(500).json({ error: "服务器内部错误" });
        }
      });

      // ========================================
      // 启动
      // ========================================

      app.listen(port, () => {
        console.log("");
        console.log("  ╔══════════════════════════════════════════════════╗");
        console.log("  ║  压测日志管理系统 Web 界面已启动                  ║");
        console.log(`  ║  打开浏览器访问: http://localhost:${port}          ║`);
        console.log("  ║                                                  ║");
        console.log("  ║  API 端点:                                       ║");
        console.log("  ║    GET  /api/entries      列出条目               ║");
        console.log("  ║    POST /api/entries      创建条目 (文件上传)    ║");
        console.log("  ║    GET  /api/entries/:id  查看详情               ║");
        console.log("  ║    PUT  /api/entries/:id  更新条目               ║");
        console.log("  ║    DELETE /api/entries/:id 删除条目              ║");
        console.log("  ║    GET  /api/search?q=    搜索                   ║");
        console.log("  ║    GET  /api/stats        统计                   ║");
        console.log("  ╚══════════════════════════════════════════════════╝");
        console.log("");
        console.log("  按 Ctrl+C 停止服务");
        console.log("");
      });
    });
}
