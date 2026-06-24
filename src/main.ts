#!/usr/bin/env node
/**
 * logstash CLI — 入口
 *
 * 设计目的:
 * - 所有 CLI 命令的统一注册和路由
 * - 使用 Commander.js 提供声明式 CLI 界面
 * - 自动查找 stash 根目录（从当前目录向上搜索）
 *
 * 为什么用 Commander.js？
 * - 极简 API，声明式命令定义
 * - 自动生成 --help 文档
 * - 社区标准，用户熟悉
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { findStashRoot } from "./core/stash.js";
import { initCommand } from "./commands/init.js";
import { addCommand } from "./commands/add.js";
import { listCommand } from "./commands/list.js";
import { getCommand } from "./commands/get.js";
import { updateCommand } from "./commands/update.js";
import { deleteCommand } from "./commands/delete.js";
import { searchCommand } from "./commands/search.js";
import { exportCommand } from "./commands/export.js";
import { gitCommand } from "./commands/git.js";
import { validateCommand } from "./commands/validate.js";
import { rebuildCommand } from "./commands/rebuild.js";
import { serveCommand } from "./commands/serve.js";

const program = new Command();

program
  .name("logstash")
  .description("压测日志分析缓存文档系统 — 统一的压测日志/图片/PCAP 文件管理工具")
  .version("0.1.0")
  .addHelpText(
    "after",
    `
使用示例:
  $ logstash init --project "my-project"    初始化 stash
  $ logstash add test.log capture.pcap      添加测试记录
  $ logstash search "吞吐量"                  搜索
  $ logstash get LST-20240624-001           查看详情
  $ logstash list --project my-project      列出条目

更多信息: https://github.com/example/logstash
`
  );

// 注册所有子命令
initCommand(program);
addCommand(program);
listCommand(program);
getCommand(program);
updateCommand(program);
deleteCommand(program);
searchCommand(program);
exportCommand(program);
gitCommand(program);
validateCommand(program);
rebuildCommand(program);
serveCommand(program);

program.parse(process.argv);
