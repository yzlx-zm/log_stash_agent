/**
 * add 命令 — 创建新的压测记录
 *
 * 用法: logstash add <files...> [选项]
 *
 * 设计目的:
 * - 用户的核心操作入口：把测试结果存入系统
 * - 支持带标签的文件批量入库
 * - 自动检测文件类型 (log/image/pcap/other)
 * - 自动计算 SHA-256 用于去重
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { exists } from "../utils/fs.js";
import { success, error, info } from "../utils/cli.js";
import { createEntry } from "../core/entry.js";
import { findStashRoot } from "../core/stash.js";
import { nowISO } from "../utils/time.js";

export function addCommand(program: Command): void {
  program
    .command("add")
    .description("添加一条新的压测记录，附带日志/图片/PCAP 文件")
    .argument("[files...]", "要添加的文件路径")
    .requiredOption("-t, --title <text>", "测试标题")
    .requiredOption("-y, --type <name>", "测试类型 (throughput, latency, stability, ...)")
    .option("-p, --project <name>", "项目名称")
    .option("--tester <name>", "测试人员")
    .option("--tags <tags>", "标签，逗号分隔 (如: wifi,regression,夜间测试)")
    .option("--desc <text>", "详细描述 (支持 Markdown)")
    .option("--status <status>", "状态 (planned|in-progress|completed|reviewed|archived)", "completed")
    .option("--timestamp <iso>", "测试执行时间 (ISO 8601)，默认为当前时间")
    .option("--move", "移动文件而非复制")
    .option("--env <json>", "环境参数 (JSON 格式)")
    .option("--results <json>", "测试结果 (JSON 格式)")
    .action(async (files: string[], options) => {
      // 查找 stash
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash（缺少 .logstash 目录），请先运行: logstash init");
        process.exit(1);
      }

      // 验证文件存在
      const validFiles: string[] = [];
      for (const f of files) {
        const abs = resolve(f);
        if (await exists(abs)) {
          validFiles.push(abs);
        } else {
          error(`文件不存在: ${f}`);
        }
      }

      // 解析标签
      const tags = options.tags
        ? options.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];

      // 解析 JSON 参数
      let environment = {};
      let results = {};
      try {
        if (options.env) environment = JSON.parse(options.env);
        if (options.results) results = JSON.parse(options.results);
      } catch {
        error("--env 和 --results 必须是有效的 JSON");
        process.exit(1);
      }

      try {
        info("创建新的测试记录...");

        const entry = await createEntry(rootDir, {
          title: options.title,
          project: options.project || "default",
          testType: options.type,
          tester: options.tester || "",
          tags,
          description: options.desc || "",
          status: options.status,
          environment,
          results,
          files: validFiles,
          fileMode: options.move ? "move" : "copy",
        });

        success(`已创建: ${entry.id}`);
        console.log("");
        console.log(`  标题: ${entry.title}`);
        console.log(`  项目: ${entry.project}`);
        console.log(`  类型: ${entry.testType}`);
        console.log(`  状态: ${entry.status}`);
        if (tags.length > 0) console.log(`  标签: ${tags.join(", ")}`);
        console.log(`  文件: ${entry.files.length} 个`);
        for (const f of entry.files) {
          console.log(`    - ${f.name} (${f.type}, ${(f.size / 1024).toFixed(1)} KB)`);
        }
      } catch (err) {
        error(`创建失败: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
