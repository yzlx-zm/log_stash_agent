/**
 * git 命令 — Git 辅助功能
 *
 * 用法: logstash git <subcommand>
 *
 * 设计目的:
 * - 简化 Git LFS 配置
 * - 查看 stash 的 Git 变更状态
 * - 为团队分发和版本管理提供便利
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { findStashRoot } from "../core/stash.js";
import { error, success, info } from "../utils/cli.js";
import { execSync } from "node:child_process";

function runGit(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, { cwd, encoding: "utf-8", stdio: "pipe" });
  } catch (err: any) {
    return err.stderr || err.message || String(err);
  }
}

export function gitCommand(program: Command): void {
  const gitCmd = program
    .command("git")
    .description("Git 辅助命令（版本管理和分发）");

  gitCmd
    .command("init")
    .description("配置 Git LFS 用于管理大文件")
    .action(async () => {
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash");
        process.exit(1);
      }

      // 检查 git 是否已初始化
      const gitDir = resolve(rootDir, ".git");
      const { exists } = await import("../utils/fs.js");

      if (!(await exists(gitDir))) {
        info("运行 git init...");
        const out = runGit("init", rootDir);
        console.log(out);
      }

      // 检查 git-lfs 是否安装
      info("检查 Git LFS...");
      const lfsOut = runGit("lfs version", rootDir);
      if (lfsOut.includes("command not found") || lfsOut.includes("not a git command")) {
        error("Git LFS 未安装。请先安装: https://git-lfs.com");
        process.exit(1);
      }
      console.log(lfsOut.trim());

      // 初始化 Git LFS
      info("配置 Git LFS...");
      console.log(runGit("lfs install", rootDir));

      // 跟踪二进制文件类型
      const patterns = [
        "*.log", "*.pcap", "*.pcapng", "*.png", "*.jpg",
        "*.jpeg", "*.bmp", "*.zip", "*.tar.gz", "*.7z",
      ];
      for (const pattern of patterns) {
        runGit(`lfs track "${pattern}"`, rootDir);
      }

      success("Git LFS 配置完成！");
      console.log("");
      console.log("  后续步骤:");
      console.log("    git add -A");
      console.log('    git commit -m "初始化 logstash stash"');
      console.log("    git remote add origin <url>");
      console.log("    git push origin main");
    });

  gitCmd
    .command("status")
    .description("查看 stash 的 Git 状态")
    .action(async () => {
      const rootDir = await findStashRoot(process.cwd());
      if (!rootDir) {
        error("当前目录不是 stash");
        process.exit(1);
      }

      console.log(runGit("status --short", rootDir) || "(没有变更)");
    });
}
