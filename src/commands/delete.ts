/**
 * delete 命令 — 删除条目
 *
 * 用法: logstash delete <id> [--yes]
 *
 * 设计目的:
 * - 删除整个 entry 目录（包括所有附件）
 * - 同步更新索引和标签
 * - 默认需要确认（--yes 跳过确认）
 *
 * 为什么需要确认？
 * - 删除操作不可逆（包含附件文件）
 * - 防止误操作
 */

import { Command } from "commander";
import { findStashRoot } from "../core/stash.js";
import { deleteEntry, readEntry } from "../core/entry.js";
import { success, error, warn } from "../utils/cli.js";
import chalk from "chalk";
import * as readline from "node:readline";

function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

export function deleteCommand(program: Command): void {
  program
    .command("delete")
    .description("删除一条测试记录（包括所有附件）")
    .argument("<id>", "Entry ID")
    .option("--yes", "跳过确认提示")
    .option("--dry-run", "只显示将被删除的内容，不实际删除")
    .action(async (entryId: string, options) => {
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash");
        process.exit(1);
      }

      if (options.dryRun) {
        const entry = await readEntry(rootDir, entryId);
        if (!entry) {
          error(`Entry 不存在: ${entryId}`);
          process.exit(1);
        }
        console.log(chalk.yellow(`[DRY RUN] 将删除: ${entry.id} — ${entry.title}`));
        console.log(`  项目: ${entry.project}`);
        console.log(`  文件: ${entry.files.length} 个`);
        for (const f of entry.files) {
          console.log(`    - ${f.name}`);
        }
        return;
      }

      // 确认
      if (!options.yes) {
        const entry = await readEntry(rootDir, entryId);
        if (!entry) {
          error(`Entry 不存在: ${entryId}`);
          process.exit(1);
        }

        console.log("");
        console.log(chalk.red(`  即将删除: ${entry.id} — ${entry.title}`));
        console.log(`  项目: ${entry.project}`);
        console.log(`  文件: ${entry.files.length} 个`);
        console.log("");

        const confirmed = await askConfirm(
          chalk.yellow("  确认删除？此操作不可逆 (y/N): ")
        );
        if (!confirmed) {
          warn("已取消");
          process.exit(0);
        }
      }

      try {
        const entry = await deleteEntry(rootDir, entryId);

        if (!entry) {
          error(`Entry 不存在: ${entryId}`);
          process.exit(1);
        }

        success(`已删除: ${entry.id} — ${entry.title}`);
      } catch (err) {
        error(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
