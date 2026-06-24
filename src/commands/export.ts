/**
 * export 命令 — 导出条目
 *
 * 用法: logstash export <id> [--format json|markdown|html] [--output <file>]
 *
 * 设计目的:
 * - 生成可分享的测试报告
 * - 支持多种导出格式
 * - Markdown 适合 Git 归档，JSON 适合程序处理
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { findStashRoot } from "../core/stash.js";
import { readEntry } from "../core/entry.js";
import { error, success } from "../utils/cli.js";
import { formatTime } from "../utils/time.js";

export function exportCommand(program: Command): void {
  program
    .command("export")
    .description("导出条目为独立报告")
    .argument("<id>", "Entry ID")
    .option("-f, --format <format>", "导出格式: json, markdown, html", "markdown")
    .option("-o, --output <file>", "输出文件路径 (默认: stdout)")
    .action(async (entryId: string, options) => {
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash");
        process.exit(1);
      }

      const entry = await readEntry(rootDir, entryId);
      if (!entry) {
        error(`Entry 不存在: ${entryId}`);
        process.exit(1);
      }

      let output: string;

      switch (options.format) {
        case "json":
          output = JSON.stringify(entry, null, 2);
          break;

        case "html":
          output = toHtml(entry);
          break;

        case "markdown":
        default:
          output = toMarkdown(entry);
          break;
      }

      if (options.output) {
        await writeFile(resolve(options.output), output, "utf-8");
        success(`已导出到: ${options.output}`);
      } else {
        console.log(output);
      }
    });
}

/**
 * 转换为 Markdown 格式
 */
function toMarkdown(entry: any): string {
  const lines: string[] = [];

  lines.push(`# ${entry.id}: ${entry.title}`);
  lines.push("");
  lines.push(`| 字段 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 项目 | ${entry.project} |`);
  lines.push(`| 测试类型 | ${entry.testType} |`);
  lines.push(`| 测试人员 | ${entry.tester || "-"} |`);
  lines.push(`| 状态 | ${entry.status} |`);
  lines.push(`| 测试时间 | ${formatTime(entry.timestamp)} |`);
  lines.push(`| 创建时间 | ${formatTime(entry.createdAt)} |`);

  if (entry.tags.length > 0) {
    lines.push(`| 标签 | ${entry.tags.join(", ")} |`);
  }

  lines.push("");

  if (entry.description) {
    lines.push("## 描述");
    lines.push("");
    lines.push(entry.description);
    lines.push("");
  }

  if (Object.keys(entry.environment).length > 0) {
    lines.push("## 环境参数");
    lines.push("");
    for (const [k, v] of Object.entries(entry.environment)) {
      lines.push(`- **${k}**: ${v}`);
    }
    lines.push("");
  }

  if (Object.keys(entry.results).length > 0) {
    lines.push("## 测试结果");
    lines.push("");
    for (const [k, v] of Object.entries(entry.results)) {
      lines.push(`- **${k}**: ${v}`);
    }
    lines.push("");
  }

  lines.push("## 附件");
  lines.push("");
  for (const f of entry.files) {
    lines.push(`- **${f.name}** (${f.type}, ${(f.size / 1024).toFixed(1)} KB)`);
    lines.push(`  - SHA-256: \`${f.hash}\``);
  }

  if (entry.relatedEntries.length > 0) {
    lines.push("");
    lines.push("## 关联条目");
    lines.push("");
    for (const rel of entry.relatedEntries) {
      lines.push(`- ${rel}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * 转换为 HTML 格式
 */
function toHtml(entry: any): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${entry.id}: ${entry.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2em auto; padding: 0 1em; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    .section { margin-top: 2em; }
  </style>
</head>
<body>
  <h1>${entry.id}: ${entry.title}</h1>
  <table>
    <tr><th>项目</th><td>${entry.project}</td></tr>
    <tr><th>测试类型</th><td>${entry.testType}</td></tr>
    <tr><th>测试人员</th><td>${entry.tester || "-"}</td></tr>
    <tr><th>状态</th><td>${entry.status}</td></tr>
    <tr><th>测试时间</th><td>${formatTime(entry.timestamp)}</td></tr>
  </table>

  <div class="section">
    <h2>附件</h2>
    <ul>
      ${entry.files.map((f: any) => `<li>${f.name} (${f.type}, ${(f.size / 1024).toFixed(1)} KB)</li>`).join("")}
    </ul>
  </div>
</body>
</html>`;
}
