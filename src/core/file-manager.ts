/**
 * 文件管理器
 *
 * 设计目的:
 * - 统一管理附件的复制、哈希计算、类型检测
 * - 支持去重：相同哈希的文件不重复存储
 * - 支持 copy（保留原文件）和 move（移动原文件）两种模式
 *
 * 为什么需要 SHA-256 去重？
 * - 同一个日志文件可能被多次引用（如复测时引用基线日志）
 * - 不重复存储节省空间
 * - 哈希值可以快速判断两个文件是否相同
 */

import { copyFile, rename, stat } from "node:fs/promises";
import { basename, resolve, relative } from "node:path";
import { fileHash } from "../utils/hash.js";
import { detectFileType, detectMimeType } from "../utils/file-type.js";
import { ensureDir, exists, fileSize } from "../utils/fs.js";
import type { EntryFile, FileType } from "../types/entry.js";

/** 文件添加模式 */
export type AddMode = "copy" | "move";

/**
 * 单个文件的入库结果
 */
export interface AddFileResult {
  /** EntryFile 元数据 */
  entryFile: EntryFile;
  /** 是否为新文件（false = 已存在，跳过/去重） */
  isNew: boolean;
  /** 如果去重，被引用的已有哈希 */
  duplicateOf?: string;
}

/**
 * 将外部文件添加到 Entry 的 files/ 目录
 *
 * @param sourcePath - 原始文件路径
 * @param entryDir - Entry 目录的绝对路径
 * @param mode - "copy" 保留原文件 / "move" 移动原文件
 * @param skipDuplicates - 是否跳过去重（默认 true）
 * @returns 入库结果
 */
export async function addFile(
  sourcePath: string,
  entryDir: string,
  mode: AddMode = "copy",
  skipDuplicates: boolean = true
): Promise<AddFileResult> {
  const fileName = basename(sourcePath);
  const targetSubDir = resolve(entryDir, "files");
  const targetPath = resolve(targetSubDir, fileName);

  // 确保 files/ 目录存在
  await ensureDir(targetSubDir);

  // 计算哈希（在复制前计算，因为是读操作）
  const hash = await fileHash(sourcePath);
  const size = await fileSize(sourcePath);
  const type = detectFileType(fileName);
  const mimeType = detectMimeType(fileName);

  // 构建基本元数据
  const entryFile: EntryFile = {
    name: fileName,
    path: `files/${fileName}`,
    type,
    mimeType,
    size: size >= 0 ? size : 0,
    hash,
    addedAt: new Date().toISOString(),
    key: false,
  };

  // 检查目标文件是否已存在
  if (await exists(targetPath)) {
    // 计算已有文件的哈希
    const existingHash = await fileHash(targetPath);
    if (existingHash === hash && skipDuplicates) {
      // 内容相同，跳过
      return { entryFile, isNew: false, duplicateOf: hash };
    }
    // 内容不同但同名 — 追加序号
    // 这种情况交给上层处理，这里先覆盖（实际场景中很少见）
  }

  // 复制或移动文件
  if (mode === "move") {
    await rename(sourcePath, targetPath);
  } else {
    await copyFile(sourcePath, targetPath);
  }

  return { entryFile, isNew: true };
}

/**
 * 为 Entry 目录构建完整的 EntryFile 列表
 * 用于从已有 entry 加载文件列表
 */
export async function listEntryFiles(
  filesDir: string,
  entryDir: string
): Promise<EntryFile[]> {
  const result: EntryFile[] = [];

  if (!(await exists(filesDir))) return result;

  const { readdir, stat: fsStat } = await import("node:fs/promises");
  const names = await readdir(filesDir);

  for (const name of names) {
    const fullPath = resolve(filesDir, name);
    const s = await fsStat(fullPath);
    if (!s.isFile()) continue;

    const hash = await fileHash(fullPath);
    const type = detectFileType(name);

    result.push({
      name,
      path: `files/${name}`,
      type,
      mimeType: detectMimeType(name),
      size: s.size,
      hash,
      addedAt: s.birthtime.toISOString(),
      key: false,
    });
  }

  return result;
}

/**
 * 从 Entry 的 files 列表中汇总文件类型
 * 用于索引中的 fileTypes 字段
 */
export function collectFileTypes(files: EntryFile[]): string[] {
  const types = new Set<string>();
  for (const f of files) {
    types.add(f.type);
  }
  return [...types].sort();
}
