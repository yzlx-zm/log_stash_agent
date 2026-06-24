/**
 * 倒排索引 — 全文搜索引擎
 *
 * 设计目的:
 * - Tier 2 搜索：对 title 和 description 字段建立全文索引
 * - 支持中文关键词搜索（bigram 二元组分词）
 * - 支持英文单词搜索（按空格/标点分词）
 * - 自建，无外部依赖，离线可用
 *
 * 为什么不用 Elasticsearch / Meilisearch？
 * - 用户需要一个离线可用的系统
 * - 压测日志 stash 通常只有几百到几千条，倒排索引完全够用
 * - 零安装、零配置、零维护
 *
 * 为什么用 bigram 处理中文？
 * - 中文没有天然空格分隔，需要分词策略
 * - bigram（二元组）是最简单的分词方案：每个连续两个字符组成一个"词"
 * - 例："吞吐量测试" → ["吞吐", "吐量", "量测", "测试"]
 * - 优点：无需词典、无需安装分词库、处理任意中文文本
 * - 缺点：索引体积较大，但几千条条目完全不是问题
 * - 未来可以升级为 jieba 分词获得更好的精度和更小的索引
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exists } from "../utils/fs.js";
import { PATHS } from "../core/stash.js";
import type { Entry, InvertedIndex, InvertedTerm, TermDocInfo } from "../types/entry.js";
import { parseJson } from "../core/metadata.js";

/**
 * 从文本中提取 token
 *
 * 策略：
 * 1. 英文单词：按非字母数字字符分割，转小写，过滤长度 < 2 的
 * 2. 中文：生成 bigram（二元组）
 * 3. 数字/混合词保留原样
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];

  if (!text || text.trim().length === 0) return tokens;

  const normalized = text.trim();

  // 检测是否包含中文
  const hasChinese = /[一-鿿]/.test(normalized);

  if (hasChinese) {
    // 中文字符的 bigram
    const chars = [...normalized];
    for (let i = 0; i < chars.length - 1; i++) {
      const bigram = chars[i] + chars[i + 1];
      // 跳过包含空格或标点的 bigram
      if (/[\s\p{P}]+/u.test(bigram)) continue;
      tokens.push(bigram.toLowerCase());
    }
  }

  // 同时提取英文单词（通用处理）
  const wordMatches = normalized.match(/[a-zA-Z0-9_]{2,}/g);
  if (wordMatches) {
    for (const w of wordMatches) {
      tokens.push(w.toLowerCase());
    }
  }

  // 去重
  return [...new Set(tokens)];
}

/**
 * 为单个 Entry 构建倒排索引条目
 *
 * @param entry - Entry 对象
 * @param fields - 要索引的字段名列表（如 ["title", "description"]）
 * @returns 词到文档信息的映射
 */
export function indexEntry(
  entry: Entry,
  fields: string[] = ["title", "description"]
): Record<string, TermDocInfo> {
  const result: Record<string, TermDocInfo> = {};

  for (const field of fields) {
    const value = (entry as unknown as Record<string, unknown>)[field];
    if (typeof value !== "string") continue;

    const tokens = tokenize(value);

    for (const token of tokens) {
      if (!result[token]) {
        result[token] = { tf: 0, fields: [] };
      }
      result[token].tf++;
      if (!result[token].fields.includes(field)) {
        result[token].fields.push(field);
      }
    }
  }

  return result;
}

/**
 * 读取倒排索引
 */
export async function readInvertedIndex(
  rootDir: string
): Promise<InvertedIndex> {
  const indexPath = resolve(rootDir, PATHS.invertedIndex);

  if (!(await exists(indexPath))) {
    return createEmptyInvertedIndex();
  }

  const raw = await readFile(indexPath, "utf-8");
  const index = parseJson<InvertedIndex>(raw);
  return index ?? createEmptyInvertedIndex();
}

function createEmptyInvertedIndex(): InvertedIndex {
  return {
    version: 1,
    fields: ["title", "description"],
    docs: 0,
    terms: {},
  };
}

/**
 * 向倒排索引中添加一个 Entry
 */
export async function addToInvertedIndex(
  rootDir: string,
  entry: Entry
): Promise<InvertedIndex> {
  const index = await readInvertedIndex(rootDir);
  const termInfos = indexEntry(entry, index.fields);

  for (const [term, info] of Object.entries(termInfos)) {
    if (!index.terms[term]) {
      index.terms[term] = { count: 0, docs: {} };
    }
    index.terms[term].count++;
    index.terms[term].docs[entry.id] = info;
  }

  index.docs++;

  await writeInvertedIndex(rootDir, index);
  return index;
}

/**
 * 从倒排索引中移除一个 Entry
 */
export async function removeFromInvertedIndex(
  rootDir: string,
  entryId: string
): Promise<InvertedIndex> {
  const index = await readInvertedIndex(rootDir);

  // 遍历所有词条，从 docs 中删除该 entry
  const termsToRemove: string[] = [];
  for (const [term, termEntry] of Object.entries(index.terms)) {
    if (termEntry.docs[entryId]) {
      delete termEntry.docs[entryId];
      termEntry.count--;
      if (termEntry.count <= 0) {
        termsToRemove.push(term);
      }
    }
  }

  for (const term of termsToRemove) {
    delete index.terms[term];
  }

  index.docs = Math.max(0, index.docs - 1);

  await writeInvertedIndex(rootDir, index);
  return index;
}

/**
 * 在倒排索引中搜索
 *
 * @param index - 倒排索引
 * @param query - 搜索关键词（可以包含空格，中文无需空格）
 * @returns 匹配的 Entry ID 列表，按相关度排序
 */
export function searchInverted(
  index: InvertedIndex,
  query: string
): { entryId: string; score: number }[] {
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) return [];

  // 如果没有生成 token（纯数字/单字符等），尝试作为子串匹配
  const effectiveTokens =
    queryTokens.length > 0
      ? queryTokens
      : query.toLowerCase().trim()
        ? [query.toLowerCase().trim()]
        : [];

  if (effectiveTokens.length === 0) return [];

  // 汇总每个文档的匹配得分
  const scores: Record<string, number> = {};

  for (const token of effectiveTokens) {
    const term = index.terms[token];
    if (!term) continue;

    for (const [docId, info] of Object.entries(term.docs)) {
      if (!scores[docId]) scores[docId] = 0;
      // 得分 = 词频；多个 token 匹配则累加
      scores[docId] += info.tf;
    }
  }

  // 按得分降序排列
  return Object.entries(scores)
    .map(([entryId, score]) => ({ entryId, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * 完全重建倒排索引
 *
 * @param rootDir - stash 根目录
 * @param entries - 所有 Entry 列表
 */
export async function rebuildInvertedIndex(
  rootDir: string,
  entries: Entry[]
): Promise<InvertedIndex> {
  const index = createEmptyInvertedIndex();

  for (const entry of entries) {
    const termInfos = indexEntry(entry, index.fields);
    for (const [term, info] of Object.entries(termInfos)) {
      if (!index.terms[term]) {
        index.terms[term] = { count: 0, docs: {} };
      }
      index.terms[term].count++;
      index.terms[term].docs[entry.id] = info;
    }
    index.docs++;
  }

  await writeInvertedIndex(rootDir, index);
  return index;
}

/**
 * 写入倒排索引到磁盘
 */
async function writeInvertedIndex(
  rootDir: string,
  index: InvertedIndex
): Promise<void> {
  const indexPath = resolve(rootDir, PATHS.invertedIndex);
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
}
