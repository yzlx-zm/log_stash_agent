/**
 * Entry CRUD 模块 — 核心操作层
 *
 * 设计目的:
 * - 这是整个系统的"大脑"：所有对 Entry 的增删查改操作
 * - 协调 file-manager、index-manager、id-generator 等子模块
 * - 确保操作原子性：创建/删除 entry 时同步更新索引和标签
 *
 * 为什么需要这一层而不是在 CLI 命令里直接操作？
 * - 统一管理数据一致性（entry、index、tags 三者同步）
 * - CLI 命令和 REST API 复用同一套逻辑
 * - 测试更容易：测试 core 层，不依赖 CLI 或 HTTP
 */

import { readFile, writeFile, rm, rename, readdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import type { Entry, EntryStatus, EntryFile } from "../types/entry.js";
import type { LogStashConfig } from "../types/config.js";
import { nowISO } from "../utils/time.js";
import { exists, ensureDir } from "../utils/fs.js";
import { generateId, isValidId } from "./id-generator.js";
import { addFile, listEntryFiles, collectFileTypes } from "./file-manager.js";
import { validateEntry, parseJson, serializeEntry } from "./metadata.js";
import { findStashRoot, PATHS } from "./stash.js";
import { upsertIndex, removeFromIndex, updateTags, toIndexEntry } from "./index-manager.js";
import { addToInvertedIndex, removeFromInvertedIndex } from "../search/inverted-index.js";

/**
 * 创建新 Entry 的输入参数
 */
export interface CreateEntryInput {
  title: string;
  project: string;
  testType: string;
  tester?: string;
  tags?: string[];
  description?: string;
  status?: EntryStatus;
  environment?: Record<string, string>;
  results?: Record<string, number | string>;
  /** 要添加的文件路径列表 */
  files?: string[];
  /** 文件添加模式: copy 或 move */
  fileMode?: "copy" | "move";
  /** 可选的手动指定 ID（不指定则自动生成） */
  id?: string;
}

/**
 * 创建新的 Entry
 *
 * 操作流程:
 * 1. 生成 ID
 * 2. 创建 entry 目录
 * 3. 复制/移动附件
 * 4. 写入 metadata.json
 * 5. 更新索引和标签
 *
 * @param rootDir - stash 根目录
 * @param input - 创建参数
 * @returns 创建的 Entry
 */
export async function createEntry(
  rootDir: string,
  input: CreateEntryInput
): Promise<Entry> {
  const now = nowISO();
  const entriesDir = resolve(rootDir, PATHS.entries);

  // 1. 生成 ID（如果用户提供自定义 ID，需验证格式防路径遍历）
  if (input.id) {
    validateEntryId(input.id);
  }
  const id = input.id ?? (await generateId(entriesDir));

  // 检查 ID 是否已存在
  const entryDir = resolve(entriesDir, id);
  if (await exists(entryDir)) {
    throw new Error(`Entry ${id} 已存在`);
  }

  // 2. 创建目录
  await ensureDir(entryDir);

  // 3. 处理附件
  const entryFiles: EntryFile[] = [];
  if (input.files && input.files.length > 0) {
    for (const filePath of input.files) {
      const result = await addFile(filePath, entryDir, input.fileMode ?? "copy");
      if (result.isNew || !result.duplicateOf) {
        entryFiles.push(result.entryFile);
      }
      // 去重的文件也加入（哈希相同的文件）
      if (!result.isNew && result.duplicateOf) {
        entryFiles.push(result.entryFile);
      }
    }
  }

  // 4. 构建 Entry
  const entry: Entry = {
    id,
    title: input.title,
    project: input.project,
    testType: input.testType,
    tester: input.tester ?? "",
    timestamp: now, // 测试时间默认为创建时间，可后续修改
    tags: input.tags ?? [],
    description: input.description ?? "",
    status: input.status ?? "planned",
    environment: input.environment ?? {},
    results: input.results ?? {},
    relatedEntries: [],
    files: entryFiles,
    createdAt: now,
    updatedAt: now,
  };

  // 5. 写入 metadata.json
  const metadataPath = resolve(entryDir, "metadata.json");
  await writeFile(metadataPath, serializeEntry(entry), "utf-8");

  // 6. 更新索引
  await upsertIndex(rootDir, entry);

  // 7. 更新标签
  if (entry.tags.length > 0) {
    await updateTags(rootDir, entry.tags);
  }

  // 8. 更新倒排索引（全文搜索）
  await addToInvertedIndex(rootDir, entry);

  return entry;
}

/**
 * 读取 Entry
 *
 * @param rootDir - stash 根目录
 * @param entryId - Entry ID
 * @returns Entry 或 null
 */
/**
 * 验证 entryId 格式安全，防止路径遍历攻击
 */
function validateEntryId(entryId: string): void {
  if (!isValidId(entryId)) {
    throw new Error(`无效的 Entry ID 格式: ${entryId}（期望格式: LST-YYYYMMDD-NNN）`);
  }
}

export async function readEntry(
  rootDir: string,
  entryId: string
): Promise<Entry | null> {
  validateEntryId(entryId);
  const metadataPath = resolve(rootDir, PATHS.entries, entryId, "metadata.json");

  if (!(await exists(metadataPath))) {
    return null;
  }

  const raw = await readFile(metadataPath, "utf-8");
  const entry = parseJson<Entry>(raw);

  if (!entry) {
    return null;
  }

  return entry;
}

/**
 * 更新 Entry 元数据
 *
 * 操作流程:
 * 1. 读取现有 Entry
 * 2. 合并更新字段
 * 3. 写回 metadata.json
 * 4. 更新索引（如果分类字段变化）
 *
 * @returns 更新后的 Entry，如果 Entry 不存在返回 null
 */
export async function updateEntry(
  rootDir: string,
  entryId: string,
  updates: Partial<{
    title: string;
    project: string;
    testType: string;
    tester: string;
    timestamp: string;
    tags: string[];
    description: string;
    status: EntryStatus;
    environment: Record<string, string>;
    results: Record<string, number | string>;
    relatedEntries: string[];
  }>
): Promise<Entry | null> {
  const entry = await readEntry(rootDir, entryId);
  if (!entry) return null;

  // 记录旧标签用于 tags.json 更新
  const oldTags = [...entry.tags];

  // 合并更新
  if (updates.title !== undefined) entry.title = updates.title;
  if (updates.project !== undefined) entry.project = updates.project;
  if (updates.testType !== undefined) entry.testType = updates.testType;
  if (updates.tester !== undefined) entry.tester = updates.tester;
  if (updates.timestamp !== undefined) entry.timestamp = updates.timestamp;
  if (updates.tags !== undefined) entry.tags = updates.tags;
  if (updates.description !== undefined) entry.description = updates.description;
  if (updates.status !== undefined) entry.status = updates.status;
  if (updates.environment !== undefined) entry.environment = updates.environment;
  if (updates.results !== undefined) entry.results = updates.results;
  if (updates.relatedEntries !== undefined)
    entry.relatedEntries = updates.relatedEntries;

  entry.updatedAt = nowISO();

  // 验证
  const validation = validateEntry(entry);
  if (!validation.valid) {
    throw new Error(
      `验证失败: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`
    );
  }

  // 写回
  const metadataPath = resolve(
    rootDir,
    PATHS.entries,
    entryId,
    "metadata.json"
  );
  await writeFile(metadataPath, serializeEntry(entry), "utf-8");

  // 更新索引
  await upsertIndex(rootDir, entry);

  // 更新标签（移除旧标签，添加新标签）
  const removedTags = oldTags.filter((t) => !entry.tags.includes(t));
  const addedTags = entry.tags.filter((t) => !oldTags.includes(t));
  if (removedTags.length > 0 || addedTags.length > 0) {
    await updateTags(rootDir, addedTags, removedTags);
  }

  // 更新倒排索引（先移除旧的数据，再添加新的）
  await removeFromInvertedIndex(rootDir, entryId);
  await addToInvertedIndex(rootDir, entry);

  return entry;
}

/**
 * 删除 Entry
 *
 * 操作流程:
 * 1. 读取 Entry（获取标签信息）
 * 2. 删除整个 entry 目录（包括所有附件）
 * 3. 从索引中移除
 * 4. 更新标签计数
 *
 * 为什么直接删除目录？
 * - Entry 是自包含的，删目录即删全部
 * - 不会留下孤立文件
 *
 * @param rootDir - stash 根目录
 * @param entryId - Entry ID
 * @param dryRun - 如果为 true，只检查不执行
 * @returns 被删除的 Entry（或 null 如果不存在）
 */
export async function deleteEntry(
  rootDir: string,
  entryId: string,
  dryRun: boolean = false
): Promise<Entry | null> {
  const entry = await readEntry(rootDir, entryId);
  if (!entry) return null;

  if (dryRun) return entry;

  // 删除整个 entry 目录
  const entryDir = resolve(rootDir, PATHS.entries, entryId);
  if (await exists(entryDir)) {
    await rm(entryDir, { recursive: true, force: true });
  }

  // 从索引中移除
  await removeFromIndex(rootDir, entryId);

  // 从标签计数中减去
  if (entry.tags.length > 0) {
    await updateTags(rootDir, [], entry.tags);
  }

  // 从倒排索引中移除
  await removeFromInvertedIndex(rootDir, entryId);

  return entry;
}

/**
 * 列出所有 Entry ID
 */
export async function listEntryIds(rootDir: string): Promise<string[]> {
  const entriesDir = resolve(rootDir, PATHS.entries);
  if (!(await exists(entriesDir))) return [];

  const dirs = await readdir(entriesDir, { withFileTypes: true });
  return dirs
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse(); // 最新的在前
}

/**
 * 列出所有 Entry 的详情
 * 对于大量条目 (>1000)，应使用索引而非此方法
 */
export async function listEntries(
  rootDir: string,
  limit: number = 50,
  offset: number = 0
): Promise<Entry[]> {
  const ids = await listEntryIds(rootDir);
  const slice = ids.slice(offset, offset + limit);
  const entries: Entry[] = [];

  for (const id of slice) {
    const entry = await readEntry(rootDir, id);
    if (entry) entries.push(entry);
  }

  return entries;
}

/**
 * 关联两个 Entry（双向关联）
 */
export async function relateEntries(
  rootDir: string,
  id1: string,
  id2: string
): Promise<void> {
  const [e1, e2] = await Promise.all([
    readEntry(rootDir, id1),
    readEntry(rootDir, id2),
  ]);

  if (!e1) throw new Error(`Entry ${id1} 不存在`);
  if (!e2) throw new Error(`Entry ${id2} 不存在`);

  // 双向关联
  if (!e1.relatedEntries.includes(id2)) {
    await updateEntry(rootDir, id1, {
      relatedEntries: [...e1.relatedEntries, id2],
    });
  }
  if (!e2.relatedEntries.includes(id1)) {
    await updateEntry(rootDir, id2, {
      relatedEntries: [...e2.relatedEntries, id1],
    });
  }
}
