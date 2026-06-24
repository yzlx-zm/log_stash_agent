/**
 * search 命令 — 搜索条目
 *
 * 用法: logstash search <query> [选项]
 *
 * 设计目的:
 * - 解决用户核心痛点："查找困难"
 * - 两层搜索：索引搜索 + 可选的全文搜索
 * - 中文友好的搜索体验
 */

import { Command } from "commander";
import { findStashRoot } from "../core/stash.js";
import { readIndex } from "../core/index-manager.js";
import { search, type SearchCriteria } from "../search/engine.js";
import { searchInverted, readInvertedIndex } from "../search/inverted-index.js";
import { readEntry } from "../core/entry.js";
import { entryTable, error, info, warn } from "../utils/cli.js";
import chalk from "chalk";

export function searchCommand(program: Command): void {
  program
    .command("search")
    .description("搜索条目（支持中文关键词）")
    .argument("[query]", "搜索关键词")
    .option("-p, --project <name>", "按项目过滤")
    .option("-y, --type <name>", "按测试类型过滤")
    .option("--tag <tag>", "按标签过滤", (v: string, p: string[]) => [...p, v], [] as string[])
    .option("--status <status>", "按状态过滤")
    .option("--since <date>", "起始日期")
    .option("--until <date>", "结束日期")
    .option("--file-type <type>", "文件类型过滤: log, image, pcap")
    .option("-n, --limit <number>", "返回数量", "20")
    .option("--offset <number>", "偏移量", "0")
    .option("--fulltext", "启用全文搜索（搜索 description 字段）")
    .option("--regex", "将查询视为正则表达式")
    .option("--json", "以 JSON 格式输出")
    .action(async (query: string | undefined, options) => {
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash");
        process.exit(1);
      }

      // 如果指定了 --fulltext 且有查询关键词，使用倒排索引
      if (options.fulltext && query) {
        const invIndex = await readInvertedIndex(rootDir);
        const results = searchInverted(invIndex, query);

        if (results.length === 0) {
          console.log(chalk.dim("  (无匹配条目)"));
          return;
        }

        // 读取匹配条目的详情用于展示
        const limit = parseInt(options.limit, 10) || 20;
        const offset = parseInt(options.offset, 10) || 0;
        const page = results.slice(offset, offset + limit);

        if (options.json) {
          console.log(JSON.stringify(page, null, 2));
          return;
        }

        console.log(chalk.bold(`\n  全文搜索结果 (${results.length} 条匹配):\n`));

        const rows = [];
        for (const { entryId, score } of page) {
          const entry = await readEntry(rootDir, entryId);
          if (entry) {
            rows.push({
              id: entry.id,
              title: entry.title,
              project: entry.project,
              type: entry.testType,
              status: entry.status,
            });
          }
        }

        entryTable(rows);
        return;
      }

      // 否则使用索引搜索
      const index = await readIndex(rootDir);

      const criteria: SearchCriteria = {
        query: query,
        project: options.project,
        testType: options.type,
        tags: options.tag.length > 0 ? options.tag : undefined,
        status: options.status as SearchCriteria["status"],
        since: options.since,
        until: options.until,
        fileType: options.fileType,
        regex: options.regex ? query : undefined,
        limit: parseInt(options.limit, 10) || 20,
        offset: parseInt(options.offset, 10) || 0,
      };

      const result = search(index, criteria);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.entries.length === 0) {
        console.log(chalk.dim("  (无匹配条目)"));
        if (query) {
          console.log("");
          console.log(`  建议: 尝试更宽泛的关键词，或使用 --fulltext 搜索描述内容`);
        }
        return;
      }

      const rows = result.entries.map((e) => ({
        id: e.id,
        title: e.title,
        project: e.project,
        type: e.testType,
        status: e.status,
      }));

      console.log("");
      entryTable(rows);

      if (result.total > (parseInt(options.limit, 10) || 20)) {
        console.log(`  显示 ${rows.length} / ${result.total} 条`);
      }
    });
}
