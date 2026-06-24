/**
 * Entry ID 生成器
 *
 * 设计目的:
 * - 格式 "LST-YYYYMMDD-NNN": 人类可读、时间排序、防止碰撞
 * - 计数器按日期重置，每天从 001 开始
 * - 如果已有同名 ID，自动递增避免碰撞（支持 merge 场景）
 *
 * 为什么不用 UUID？
 * - UUID 不包含时间信息，无法快速判断条目大致时间
 * - UUID 不可读，不利于人工引用和讨论
 * - "LST-20240624-001" 比 "a1b2c3d4-..." 更适合写在报告和邮件里
 */

import { readdir } from "node:fs/promises";
import { dateTag } from "../utils/time.js";
import { exists } from "../utils/fs.js";
import { resolve } from "node:path";

/** ID 格式的正则 */
const ID_PATTERN = /^LST-(\d{8})-(\d{3})$/;

/**
 * 从 Entry ID 中提取日期部分
 */
export function extractDate(id: string): string | null {
  const m = id.match(ID_PATTERN);
  return m ? m[1] : null;
}

/**
 * 从 Entry ID 中提取序号
 */
export function extractSeq(id: string): number | null {
  const m = id.match(ID_PATTERN);
  return m ? parseInt(m[2], 10) : null;
}

/**
 * 验证 ID 格式是否合法
 */
export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/**
 * 在给定的 stash entries 目录中生成下一个可用 ID
 *
 * @param entriesDir - entries 目录的绝对路径
 * @param date - 目标日期，默认今天
 * @returns 下一个可用的 ID 字符串
 */
export async function generateId(
  entriesDir: string,
  date: Date = new Date()
): Promise<string> {
  const dt = dateTag(date);
  const prefix = `LST-${dt}-`;

  // 扫描所有已有条目，找出今天已用的最大序号
  let maxSeq = 0;

  if (await exists(entriesDir)) {
    const dirs = await readdir(entriesDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      if (d.name.startsWith(prefix)) {
        const seq = parseInt(d.name.slice(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

/**
 * 检查 ID 是否已被占用
 */
export async function idExists(
  id: string,
  entriesDir: string
): Promise<boolean> {
  return exists(resolve(entriesDir, id));
}
