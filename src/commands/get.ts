/**
 * get 命令 — 查看条目详情
 *
 * 用法: logstash get <id>
 *
 * 设计目的:
 * - 完整展示单条记录的所有信息
 * - 包括元数据、文件列表、notes.md（如有）
 */

import { Command } from "commander";
import { readEntry } from "../core/entry.js";
import { findStashRoot } from "../core/stash.js";
import { error, table, info } from "../utils/cli.js";
import { formatTime, toDateOnly } from "../utils/time.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exists } from "../utils/fs.js";
import chalk from "chalk";

export function getCommand(program: Command): void {
  program
    .command("get")
    .description("查看指定条目的详细信息")
    .argument("<id>", "Entry ID (如 LST-20240624-001)")
    .option("--json", "以 JSON 格式输出")
    .option("--files", "仅列出文件信息")
    .option("--notes", "显示 notes.md 内容")
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

      if (options.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
      }

      if (options.files) {
        console.log(chalk.bold(`\n${entry.id} — 文件列表 (${entry.files.length} 个):\n`));
        for (const f of entry.files) {
          console.log(
            `  ${chalk.cyan(f.name)}  [${f.type}]  ${(f.size / 1024).toFixed(1)} KB  ${chalk.dim(f.hash.slice(0, 12))}`
          );
        }
        return;
      }

      // 完整显示
      console.log("");
      console.log(chalk.bold.cyan(`  ${entry.id}: ${entry.title}`));
      console.log("  " + "─".repeat(70));
      console.log("");

      table([
        { key: "标题", value: entry.title },
        { key: "项目", value: entry.project },
        { key: "测试类型", value: entry.testType },
        { key: "测试人员", value: entry.tester || "(未指定)" },
        { key: "状态", value: entry.status },
        { key: "测试时间", value: formatTime(entry.timestamp) },
        { key: "创建时间", value: formatTime(entry.createdAt) },
        { key: "更新时间", value: formatTime(entry.updatedAt) },
      ]);

      if (entry.tags.length > 0) {
        console.log(`\n  ${chalk.dim("标签")}  ${entry.tags.join(", ")}`);
      }

      if (entry.description) {
        console.log(`\n  ${chalk.dim("描述")}`);
        console.log(`  ${entry.description}`);
      }

      if (Object.keys(entry.environment).length > 0) {
        console.log(`\n  ${chalk.dim("环境参数")}`);
        for (const [k, v] of Object.entries(entry.environment)) {
          console.log(`    ${k}: ${v}`);
        }
      }

      if (Object.keys(entry.results).length > 0) {
        console.log(`\n  ${chalk.dim("测试结果")}`);
        for (const [k, v] of Object.entries(entry.results)) {
          console.log(`    ${k}: ${v}`);
        }
      }

      if (entry.relatedEntries.length > 0) {
        console.log(`\n  ${chalk.dim("关联条目")}  ${entry.relatedEntries.join(", ")}`);
      }

      // 文件列表
      console.log(`\n  ${chalk.dim("附件")}  (${entry.files.length} 个文件)`);
      for (const f of entry.files) {
        console.log(
          `    ${chalk.cyan(f.name)}  [${f.type}]  ${(f.size / 1024).toFixed(1)} KB  ${chalk.dim(f.hash.slice(0, 12))}`
        );
      }

      // notes.md
      if (options.notes) {
        const notesPath = resolve(rootDir, "entries", entryId, "notes.md");
        if (await exists(notesPath)) {
          const notes = await readFile(notesPath, "utf-8");
          console.log(`\n  ${chalk.dim("笔记")}`);
          console.log("  " + notes.replace(/\n/g, "\n  "));
        } else {
          info("没有 notes.md");
        }
      }

      console.log("");
    });
}
