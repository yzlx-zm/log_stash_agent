/**
 * list 命令 — 列出条目
 *
 * 用法: logstash list [选项]
 *
 * 设计目的:
 * - 快速浏览所有条目
 * - 支持按项目/类型/标签/状态/日期过滤
 * - 表格化输出，方便扫描
 */

import { Command } from "commander";
import { readIndex } from "../core/index-manager.js";
import { findStashRoot } from "../core/stash.js";
import { search, type SearchCriteria } from "../search/engine.js";
import { entryTable, error } from "../utils/cli.js";

export function listCommand(program: Command): void {
  program
    .command("list")
    .description("列出条目，支持过滤条件")
    .option("-p, --project <name>", "按项目过滤")
    .option("-y, --type <name>", "按测试类型过滤")
    .option("--tag <tag>", "按标签过滤（可多次使用）", (val: string, prev: string[]) => [...prev, val], [] as string[])
    .option("--status <status>", "按状态过滤")
    .option("--since <date>", "起始日期 (YYYY-MM-DD)")
    .option("--until <date>", "结束日期 (YYYY-MM-DD)")
    .option("--file-type <type>", "按文件类型过滤: log, image, pcap, other")
    .option("-n, --limit <number>", "返回数量限制", "50")
    .option("--offset <number>", "偏移量", "0")
    .option("--json", "以 JSON 格式输出")
    .action(async (options) => {
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash，请先运行: logstash init");
        process.exit(1);
      }

      const index = await readIndex(rootDir);

      const criteria: SearchCriteria = {
        project: options.project,
        testType: options.type,
        tags: options.tag.length > 0 ? options.tag : undefined,
        status: options.status as SearchCriteria["status"],
        since: options.since,
        until: options.until,
        fileType: options.fileType,
        limit: parseInt(options.limit, 10) || 50,
        offset: parseInt(options.offset, 10) || 0,
      };

      const result = search(index, criteria);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // 表格输出
      const rows = result.entries.map((e) => ({
        id: e.id,
        title: e.title,
        project: e.project,
        type: e.testType,
        status: e.status,
      }));

      entryTable(rows);

      if (result.total > (parseInt(options.limit, 10) || 50)) {
        const shown = rows.length + (parseInt(options.offset, 10) || 0);
        console.log(`  显示 ${shown} / ${result.total} 条（使用 --offset 查看更多）`);
      }
    });
}
