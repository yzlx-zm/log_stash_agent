/**
 * 文件系统帮助函数
 *
 * 设计目的:
 * - 封装常用 fs 操作，提供更好的错误消息
 * - 确保目录存在、文件可访问等前置条件
 */

import { access, mkdir, stat, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, dirname } from "node:path";

/**
 * 检查路径是否存在
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查路径是否存在且可读
 */
export async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 确保目录存在，不存在则递归创建
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * 确保文件的父目录存在
 */
export async function ensureParentDir(filePath: string): Promise<void> {
  await ensureDir(dirname(filePath));
}

/**
 * 获取文件大小，不存在返回 -1
 */
export async function fileSize(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch {
    return -1;
  }
}

/**
 * 列出目录中的所有子目录
 */
export async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * 列出目录中的所有文件
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * 解析为绝对路径
 */
export function absPath(relative: string, baseDir: string): string {
  return resolve(baseDir, relative);
}
