/**
 * init 命令 — 初始化 stash
 *
 * 用法: logstash init [--project <name>] [--dir <path>]
 *
 * 设计目的:
 * - 在任何目录快速创建 stash 结构
 * - 每个项目独立 stash，不依赖全局数据库
 * - 自动创建 Git LFS 配置模板
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { initStash } from "../core/stash.js";
import { success, info, warn } from "../utils/cli.js";

export function initCommand(program: Command): void {
  program
    .command("init")
    .description("在当前目录（或指定目录）初始化 logstash stash")
    .option(
      "-p, --project <name>",
      "默认项目名称",
      ""
    )
    .option(
      "-d, --dir <path>",
      "目标目录（默认为当前目录）",
      "."
    )
    .action(async (options) => {
      const targetDir = resolve(options.dir);

      info(`在 ${targetDir} 初始化 stash...`);

      try {
        const result = await initStash(targetDir, options.project);

        for (const path of result.created) {
          success(`创建: ${path}`);
        }
        for (const path of result.skipped) {
          warn(`跳过（已存在）: ${path}`);
        }

        console.log("");
        success("Stash 初始化完成！");
        console.log("");
        console.log("  下一步:");
        console.log("    logstash add <files...> --title \"测试描述\"");
        console.log("    logstash git init                  (配置 Git LFS)");

        if (options.project) {
          console.log("");
          console.log(`  默认项目: ${options.project}`);
        }
      } catch (err) {
        console.error("初始化失败:", err);
        process.exit(1);
      }
    });
}
