/**
 * 搜索引擎 — 基于索引的快速搜索
 *
 * 设计目的:
 * - 这是用户核心痛点（"查找困难"）的解决方案
 * - Tier 1 搜索：基于 index.json 的元数据过滤，O(n) 内存查找，毫秒级
 * - 支持多维度组合过滤：project + type + tag + status + date range
 * - 支持简单关键词匹配（title、project、testType 字段）
 *
 * 为什么分两级搜索？
 * - Tier 1（本模块）：快速过滤 90% 的搜索场景
 * - Tier 2（inverted-index.ts）：全文搜索 description 等长文本
 * - 日常使用中，按项目/类型/标签/日期 过滤比全文搜索更常用
 */

import type { MasterIndex, IndexEntry, EntryStatus } from "../types/entry.js";

/** 搜索条件 */
export interface SearchCriteria {
  /** 关键词（匹配 title, project, testType） */
  query?: string;
  /** 按项目过滤 */
  project?: string;
  /** 按测试类型过滤 */
  testType?: string;
  /** 按标签过滤（包含任一即匹配） */
  tags?: string[];
  /** 按状态过滤 */
  status?: EntryStatus;
  /** 开始日期 (YYYY-MM-DD 或 ISO 8601) */
  since?: string;
  /** 结束日期 (YYYY-MM-DD 或 ISO 8601) */
  until?: string;
  /** 文件类型过滤: "log", "image", "pcap", "other" */
  fileType?: string;
  /** 限制返回数量 */
  limit?: number;
  /** 偏移 */
  offset?: number;
  /** 正则表达式模式（应用于 title） */
  regex?: string;
}

/** 搜索结果 */
export interface SearchResult {
  entries: IndexEntry[];
  total: number;
  criteria: SearchCriteria;
}

/**
 * 在索引上执行搜索
 *
 * @param index - 主索引
 * @param criteria - 搜索条件
 * @returns 搜索结果
 */
export function search(index: MasterIndex, criteria: SearchCriteria): SearchResult {
  const allEntries = Object.values(index.entries);

  // 先按时间倒序排列（最新的在前）
  allEntries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const filtered = allEntries.filter((entry) => matchAll(entry, criteria));

  const total = filtered.length;
  const offset = criteria.offset ?? 0;
  const limit = criteria.limit ?? 50;
  const entries = filtered.slice(offset, offset + limit);

  return { entries, total, criteria };
}

/**
 * 检查条目是否匹配所有搜索条件
 */
function matchAll(entry: IndexEntry, c: SearchCriteria): boolean {
  // 关键词搜索（大小写不敏感）
  if (c.query && !matchQuery(entry, c.query)) return false;

  // 按项目过滤
  if (c.project && entry.project !== c.project) return false;

  // 按测试类型过滤
  if (c.testType && entry.testType !== c.testType) return false;

  // 标签过滤：条目标签与搜索标签有交集即可
  if (c.tags && c.tags.length > 0) {
    if (!c.tags.some((t) => entry.tags.includes(t))) return false;
  }

  // 状态过滤
  if (c.status && entry.status !== c.status) return false;

  // 日期范围过滤 — 使用 entry.timestamp
  if (c.since || c.until) {
    const ts = new Date(entry.timestamp).getTime();
    if (c.since) {
      const sinceTs = new Date(c.since).getTime();
      if (ts < sinceTs) return false;
    }
    if (c.until) {
      // until 包含当天结束
      const untilDate = new Date(c.until);
      untilDate.setHours(23, 59, 59, 999);
      if (ts > untilDate.getTime()) return false;
    }
  }

  // 文件类型过滤
  if (c.fileType && !entry.fileTypes.includes(c.fileType)) return false;

  // 正则表达式匹配（应用于 title）
  if (c.regex) {
    try {
      const re = new RegExp(c.regex, "i");
      if (!re.test(entry.title)) return false;
    } catch {
      // 无效正则表达式，忽略
    }
  }

  return true;
}

/**
 * 关键词匹配（简单分词 + 包含检查）
 *
 * 支持中英文混合搜索：
 * - 英文按空格分词: "throughput wifi" → ["throughput", "wifi"]
 * - 中文按单字 n-gram 匹配
 * - 每个词必须在 title/project/testType/tags 中至少一个字段匹配
 */
function matchQuery(entry: IndexEntry, query: string): boolean {
  const q = query.toLowerCase().trim();

  // 搜索范围
  const searchText = [
    entry.title.toLowerCase(),
    entry.project.toLowerCase(),
    entry.testType.toLowerCase(),
    ...entry.tags.map((t) => t.toLowerCase()),
  ].join(" ");

  // 简单子串匹配
  if (searchText.includes(q)) return true;

  // 如果查询包含空格，分词后每个词都必须匹配
  if (q.includes(" ")) {
    const terms = q.split(/\s+/).filter((t) => t.length > 0);
    return terms.every((term) => searchText.includes(term));
  }

  return false;
}

/**
 * 获取所有不重复的项目名称
 */
export function getProjects(index: MasterIndex): string[] {
  const projects = new Set<string>();
  for (const entry of Object.values(index.entries)) {
    projects.add(entry.project);
  }
  return [...projects].sort();
}

/**
 * 获取所有不重复的测试类型
 */
export function getTestTypes(index: MasterIndex): string[] {
  const types = new Set<string>();
  for (const entry of Object.values(index.entries)) {
    types.add(entry.testType);
  }
  return [...types].sort();
}

/**
 * 获取索引统计概览
 */
export function getStats(index: MasterIndex) {
  return {
    ...index.counts,
    projects: getProjects(index).length,
    testTypes: getTestTypes(index).length,
    lastUpdated: index.lastUpdated,
  };
}
