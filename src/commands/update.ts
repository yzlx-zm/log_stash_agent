/**
 * update 命令 — 更新条目元数据
 *
 * 用法: logstash update <id> [选项]
 *
 * 设计目的:
 * - 修改已有条目的标签、状态、描述等
 * - 仅更新指定字段，不改变其他字段
 * - 自动同步索引和标签
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { findStashRoot } from "../core/stash.js";
import { updateEntry } from "../core/entry.js";
import { success, error, warn } from "../utils/cli.js";

export function updateCommand(program: Command): void {
  program
    .command("update")
    .description("更新条目的元数据")
    .argument("<id>", "Entry ID")
    .option("--title <text>", "修改标题")
    .option("--project <name>", "修改项目")
    .option("--type <name>", "修改测试类型")
    .option("--tester <name>", "修改测试人员")
    .option("--tags <tags>", "修改标签 (逗号分隔)")
    .option("--desc <text>", "修改描述")
    .option("--status <status>", "修改状态")
    .option("--timestamp <iso>", "修改测试时间")
    .option("--env <json>", "修改环境参数 (JSON)")
    .option("--results <json>", "修改测试结果 (JSON)")
    .action(async (entryId: string, options) => {
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash");
        process.exit(1);
      }

      // 构建更新对象（只包含提供的字段）
      const updates: Record<string, unknown> = {};

      if (options.title !== undefined) updates.title = options.title;
      if (options.project !== undefined) updates.project = options.project;
      if (options.type !== undefined) updates.testType = options.type;
      if (options.tester !== undefined) updates.tester = options.tester;
      if (options.desc !== undefined) updates.description = options.desc;
      if (options.status !== undefined) updates.status = options.status;
      if (options.timestamp !== undefined) updates.timestamp = options.timestamp;

      if (options.tags !== undefined) {
        updates.tags = options.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      }

      try {
        if (options.env) updates.environment = JSON.parse(options.env);
        if (options.results) updates.results = JSON.parse(options.results);
      } catch {
        error("--env 和 --results 必须是有效的 JSON");
        process.exit(1);
      }

      if (Object.keys(updates).length === 0) {
        warn("没有提供任何更新字段");
        process.exit(1);
      }

      try {
        const entry = await updateEntry(rootDir, entryId, updates as any);

        if (!entry) {
          error(`Entry 不存在: ${entryId}`);
          process.exit(1);
        }

        success(`已更新: ${entry.id}`);
        for (const [key, value] of Object.entries(updates)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      } catch (err) {
        error(`更新失败: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
