/**
 * 时间工具函数
 *
 * 设计目的:
 * - 统一 ISO 8601 格式，确保跨系统兼容
 * - 生成 YYYYMMDD 格式的日期串，用于 Entry ID
 */

/**
 * 返回当前时间的 ISO 8601 字符串（本地时间）
 * 格式: "2024-06-24T15:30:00.000+08:00"
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * 返回 YYYYMMDD 格式的日期字符串
 * 用于 Entry ID 生成
 */
export function dateTag(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * 格式化为人类可读的时间
 * 格式: "2024-06-24 15:30:00"
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi}:${s}`;
}

/**
 * 解析 ISO 日期字符串为本地日期字符串 (YYYY-MM-DD)
 */
export function toDateOnly(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}
