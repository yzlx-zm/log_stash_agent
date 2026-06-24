/**
 * validate 命令 — 校验 metadata.json
 *
 * 用法: logstash validate [--fix]
 *
 * 设计目的:
 * - 扫描所有 entry，检查 metadata.json 完整性
 * - 发现并报告格式错误、字段缺失等问题
 * - 帮助用户及早发现数据问题
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { findStashRoot, PATHS } from "../core/stash.js";
import { exists } from "../utils/fs.js";
import { validateEntry, parseJson } from "../core/metadata.js";
import { success, error, warn, info } from "../utils/cli.js";
import chalk from "chalk";
import type { Entry } from "../types/entry.js";

export function validateCommand(program: Command): void {
  program
    .command("validate")
    .description("校验所有条目的 metadata.json 完整性")
    .option("--fix", "尝试自动修复简单问题")
    .action(async (options) => {
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash");
        process.exit(1);
      }

      const entriesDir = resolve(rootDir, PATHS.entries);
      if (!(await exists(entriesDir))) {
        warn("entries 目录不存在");
        process.exit(0);
      }

      info("正在校验所有条目...\n");

      const dirs = await readdir(entriesDir, { withFileTypes: true });
      let checked = 0;
      let valid = 0;
      let invalid = 0;
      const issues: { entryId: string; errors: string[] }[] = [];

      for (const d of dirs) {
        if (!d.isDirectory()) continue;

        const entryId = d.name;
        checked++;

        const metadataPath = resolve(entriesDir, entryId, "metadata.json");

        // 检查 metadata.json 是否存在
        if (!(await exists(metadataPath))) {
          invalid++;
          issues.push({
            entryId,
            errors: ["缺少 metadata.json"],
          });
          continue;
        }

        // 读取并验证
        try {
          const raw = await readFile(metadataPath, "utf-8");
          const entry = parseJson<Entry>(raw);

          if (!entry) {
            invalid++;
            issues.push({ entryId, errors: ["JSON 解析失败"] });
            continue;
          }

          const result = validateEntry(entry);
          if (!result.valid) {
            invalid++;
            issues.push({
              entryId,
              errors: result.errors.map(
                (e) => `${e.field}: ${e.message}`
              ),
            });
          } else {
            valid++;
          }
        } catch (err) {
          invalid++;
          issues.push({
            entryId,
            errors: [
              `读取失败: ${err instanceof Error ? err.message : String(err)}`,
            ],
          });
        }
      }

      // 报告结果
      console.log("");
      if (issues.length === 0) {
        success(`全部通过: ${checked} 个条目均有效`);
      } else {
        console.log(
          chalk.red(`  ${invalid} 个条目有问题 / ${checked} 个总计\n`)
        );
        for (const issue of issues) {
          console.log(chalk.yellow(`  ${issue.entryId}:`));
          for (const e of issue.errors) {
            console.log(chalk.red(`    ✗ ${e}`));
          }
        }
        console.log("");
        console.log(`  有效: ${valid}, 无效: ${invalid}, 总计: ${checked}`);
      }
    });
}
