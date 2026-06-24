/**
 * CLI 输出工具
 *
 * 设计目的:
 * - 统一的终端输出格式
 * - 支持表格、颜色等 CLI 友好输出
 * - 中文友好的对齐处理
 */

import chalk from "chalk";

/**
 * 输出成功消息
 */
export function success(msg: string): void {
  console.log(chalk.green("✓"), msg);
}

/**
 * 输出错误消息
 */
export function error(msg: string): void {
  console.error(chalk.red("✗"), msg);
}

/**
 * 输出警告消息
 */
export function warn(msg: string): void {
  console.warn(chalk.yellow("⚠"), msg);
}

/**
 * 输出信息消息
 */
export function info(msg: string): void {
  console.log(chalk.blue("ℹ"), msg);
}

/**
 * 渲染简单的键值对表格
 */
export function table(
  rows: { key: string; value: string }[],
  keyWidth: number = 16
): void {
  for (const { key, value } of rows) {
    const paddedKey = key.padEnd(keyWidth);
    console.log(`  ${chalk.dim(paddedKey)} ${value}`);
  }
}

/**
 * 渲染条目列表为表格
 */
export function entryTable(
  rows: { id: string; title: string; project: string; type: string; status: string }[]
): void {
  if (rows.length === 0) {
    console.log(chalk.dim("  (无匹配条目)"));
    return;
  }

  // 表头
  console.log(
    `  ${chalk.bold("ID".padEnd(18))} ${chalk.bold("标题".padEnd(24))} ${chalk.bold("项目".padEnd(16))} ${chalk.bold("类型".padEnd(14))} ${chalk.bold("状态")}`
  );
  console.log("  " + "─".repeat(90));

  for (const r of rows) {
    const statusColor =
      r.status === "completed" || r.status === "reviewed"
        ? chalk.green
        : r.status === "in-progress"
          ? chalk.yellow
          : r.status === "archived"
            ? chalk.gray
            : chalk.white;

    // 中文字符占 2 个显示宽度，简单处理：截断过长的
    const truncate = (s: string, max: number) =>
      s.length > max ? s.slice(0, max - 2) + ".." : s;

    console.log(
      `  ${chalk.cyan(r.id.padEnd(18))} ${truncate(r.title, 22).padEnd(24)} ${truncate(r.project, 14).padEnd(16)} ${truncate(r.type, 12).padEnd(14)} ${statusColor(r.status)}`
    );
  }

  console.log(chalk.dim(`\n  共 ${rows.length} 条记录`));
}

/**
 * 将字节数格式化为人类可读
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}
