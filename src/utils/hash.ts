/**
 * 哈希工具函数
 *
 * 设计目的:
 * - SHA-256 文件哈希用于去重检测
 * - 相同内容的文件不重复存储，节省空间
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * 计算 Buffer 的 SHA-256 哈希
 */
export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * 计算文件的 SHA-256 哈希
 */
export async function fileHash(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return sha256(data);
}

/**
 * 简洁的短哈希（前 12 位）
 * 用于显示，不用于完整比较
 */
export function shortHash(fullHash: string): string {
  return fullHash.slice(0, 12);
}
