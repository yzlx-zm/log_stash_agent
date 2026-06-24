/**
 * 索引管理器
 *
 * 设计目的:
 * - 维护主索引 (index.json) — 所有条目的快速查找目录
 * - 维护标签索引 (tags.json) — 所有已知标签及其计数
 * - 索引可随时重建: 扫描 entries 目录下所有 metadata.json → 生成索引
 *
 * 为什么索引是可重建的？
 * - 索引是 metadata.json 的缓存，不是唯一真理源
 * - Git merge 冲突时，可以安全删除索引并重建
 * - 损坏的索引不影响数据完整性
 *
 * 为什么需要标签索引？
 * - 用户可能用不同写法表达同一标签 ("WiFi" vs "wifi")
 * - 标签索引提供自动补全和拼写建议
 * - 可以检测和合并重复标签
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { exists } from "../utils/fs.js";
import { PATHS } from "./stash.js";
import type {
  Entry,
  IndexEntry,
  MasterIndex,
  EntryStatus,
} from "../types/entry.js";
import { parseJson, serializeIndex, validateEntry } from "./metadata.js";

/**
 * 读取主索引
 */
export async function readIndex(rootDir: string): Promise<MasterIndex> {
  const indexPath = resolve(rootDir, PATHS.index);
  if (!(await exists(indexPath))) {
    return createEmptyIndex();
  }
  const raw = await readFile(indexPath, "utf-8");
  const index = parseJson<MasterIndex>(raw);
  return index ?? createEmptyIndex();
}

/**
 * 创建空索引
 */
function createEmptyIndex(): MasterIndex {
  return {
    version: 1,
    entries: {},
    counts: {
      total: 0,
      byProject: {},
      byTestType: {},
      byStatus: {},
      byTag: {},
    },
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * 从 Entry 生成 IndexEntry
 */
export function toIndexEntry(entry: Entry): IndexEntry {
  const fileTypes = new Set<string>();
  for (const f of entry.files) {
    fileTypes.add(f.type);
  }

  return {
    id: entry.id,
    title: entry.title,
    project: entry.project,
    testType: entry.testType,
    timestamp: entry.timestamp,
    tags: entry.tags,
    status: entry.status,
    fileCount: entry.files.length,
    fileTypes: [...fileTypes],
    createdAt: entry.createdAt,
  };
}

/**
 * 重新计算 counts 统计
 */
function recomputeCounts(
  entries: Record<string, IndexEntry>
): MasterIndex["counts"] {
  const counts: MasterIndex["counts"] = {
    total: 0,
    byProject: {},
    byTestType: {},
    byStatus: {},
    byTag: {},
  };

  for (const entry of Object.values(entries)) {
    counts.total++;
    counts.byProject[entry.project] =
      (counts.byProject[entry.project] || 0) + 1;
    counts.byTestType[entry.testType] =
      (counts.byTestType[entry.testType] || 0) + 1;
    counts.byStatus[entry.status] =
      (counts.byStatus[entry.status] || 0) + 1;

    for (const tag of entry.tags) {
      counts.byTag[tag] = (counts.byTag[tag] || 0) + 1;
    }
  }

  return counts;
}

/**
 * 向索引中添加或更新一个条目
 */
export async function upsertIndex(
  rootDir: string,
  entry: Entry
): Promise<MasterIndex> {
  const index = await readIndex(rootDir);
  const idxEntry = toIndexEntry(entry);
  index.entries[entry.id] = idxEntry;
  index.counts = recomputeCounts(index.entries);
  index.lastUpdated = new Date().toISOString();
  index.version = 1;

  await writeIndex(rootDir, index);
  return index;
}

/**
 * 从索引中删除一个条目
 */
export async function removeFromIndex(
  rootDir: string,
  entryId: string
): Promise<MasterIndex> {
  const index = await readIndex(rootDir);
  delete index.entries[entryId];
  index.counts = recomputeCounts(index.entries);
  index.lastUpdated = new Date().toISOString();

  await writeIndex(rootDir, index);
  return index;
}

/**
 * 写入索引到磁盘
 */
async function writeIndex(rootDir: string, index: MasterIndex): Promise<void> {
  const indexPath = resolve(rootDir, PATHS.index);
  await writeFile(indexPath, serializeIndex(index), "utf-8");
}

/**
 * 完全重建索引 — 扫描所有 entry 并重新生成
 *
 * 这是"缓存"系统的核心：索引损坏或 Git 冲突时，一行命令即可恢复
 *
 * @returns 重建后的索引和遇到的错误列表
 */
export async function rebuildIndex(rootDir: string): Promise<{
  index: MasterIndex;
  errors: { entryId: string; message: string }[];
}> {
  const entriesDir = resolve(rootDir, PATHS.entries);
  const index = createEmptyIndex();
  const errors: { entryId: string; message: string }[] = [];

  if (!(await exists(entriesDir))) {
    await writeIndex(rootDir, index);
    return { index, errors };
  }

  const dirs = await readdir(entriesDir, { withFileTypes: true });

  for (const d of dirs) {
    if (!d.isDirectory()) continue;

    const entryId = d.name;
    const metadataPath = resolve(entriesDir, entryId, "metadata.json");

    if (!(await exists(metadataPath))) {
      errors.push({
        entryId,
        message: "缺少 metadata.json",
      });
      continue;
    }

    try {
      const raw = await readFile(metadataPath, "utf-8");
      const entry = parseJson<Entry>(raw);

      if (!entry) {
        errors.push({ entryId, message: "metadata.json 格式无效" });
        continue;
      }

      // 验证但不阻止（尽力导入）
      const validation = validateEntry(entry);
      if (!validation.valid) {
        errors.push({
          entryId,
          message: `验证警告: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`,
        });
        // 继续导入
      }

      const idxEntry = toIndexEntry(entry);
      index.entries[entryId] = idxEntry;
    } catch (err) {
      errors.push({
        entryId,
        message: `读取失败: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  index.counts = recomputeCounts(index.entries);
  index.lastUpdated = new Date().toISOString();

  await writeIndex(rootDir, index);
  return { index, errors };
}

/**
 * 读取标签索引
 */
export async function readTags(rootDir: string): Promise<Record<string, number>> {
  const tagsPath = resolve(rootDir, PATHS.tags);
  if (!(await exists(tagsPath))) return {};

  const raw = await readFile(tagsPath, "utf-8");
  return parseJson<Record<string, number>>(raw) ?? {};
}

/**
 * 更新标签索引（添加或增量计数）
 */
export async function updateTags(
  rootDir: string,
  tags: string[],
  removedTags: string[] = []
): Promise<Record<string, number>> {
  const current = await readTags(rootDir);

  // 添加/增量
  for (const tag of tags) {
    current[tag] = (current[tag] || 0) + 1;
  }

  // 移除/减量
  for (const tag of removedTags) {
    if (current[tag]) {
      current[tag]--;
      if (current[tag] <= 0) {
        delete current[tag];
      }
    }
  }

  const tagsPath = resolve(rootDir, PATHS.tags);
  await writeFile(tagsPath, JSON.stringify(current, null, 2), "utf-8");
  return current;
}
