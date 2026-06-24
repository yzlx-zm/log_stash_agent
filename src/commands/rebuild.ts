/**
 * rebuild 命令 — 重建索引
 *
 * 用法: logstash rebuild-index [--fulltext]
 *
 * 设计目的:
 * - 从 metadata.json 完全重建索引（主索引 + 可选的倒排索引）
 * - 解决索引损坏、Git merge 冲突等问题
 * - 这是"缓存"系统的核心维护命令
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { findStashRoot, PATHS } from "../core/stash.js";
import { rebuildIndex, readIndex } from "../core/index-manager.js";
import { rebuildInvertedIndex } from "../search/inverted-index.js";
import { readEntry } from "../core/entry.js";
import { success, error, info, warn } from "../utils/cli.js";

export function rebuildCommand(program: Command): void {
  program
    .command("rebuild-index")
    .description("从 metadata.json 重建所有索引")
    .option("--fulltext", "同时重建全文倒排索引")
    .action(async (options) => {
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash");
        process.exit(1);
      }

      info("重建主索引...");

      const { index, errors } = await rebuildIndex(rootDir);

      if (errors.length > 0) {
        warn(`${errors.length} 个条目有警告:`);
        for (const e of errors) {
          console.log(`  ${e.entryId}: ${e.message}`);
        }
      }

      success(
        `主索引重建完成: ${Object.keys(index.entries).length} 个条目`
      );

      // 可选的全文索引重建
      if (options.fulltext) {
        info("重建全文逆排索引...");

        const entries = [];
        for (const id of Object.keys(index.entries)) {
          const entry = await readEntry(rootDir, id);
          if (entry) entries.push(entry);
        }

        const invIndex = await rebuildInvertedIndex(rootDir, entries);
        success(
          `全文索引重建完成: ${invIndex.docs} 个文档, ${Object.keys(invIndex.terms).length} 个词条`
        );
      }

      console.log("");
      console.log("  索引统计:");
      console.log(`    总条目: ${index.counts.total}`);
      console.log(`    项目数: ${Object.keys(index.counts.byProject).length}`);
      console.log(`    测试类型: ${Object.keys(index.counts.byTestType).length}`);
    });
}
