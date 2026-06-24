/**
 * 元数据验证与序列化
 *
 * 设计目的:
 * - 确保 metadata.json 的完整性和正确性
 * - 提供清晰的错误消息，帮助用户修复问题
 * - JSON Schema 验证防止手动编辑引入的错误
 *
 * 为什么需要验证？
 * - metadata.json 是纯文本 JSON，用户可能手动编辑
 * - 手动编辑容易引入字段缺失、类型错误、格式问题
 * - 一个损坏的 metadata.json 可能导致索引重建失败
 * - `logstash validate` 命令可以提前发现并修复问题
 */

import type { Entry, EntryFile, EntryStatus, MasterIndex, InvertedIndex } from "../types/entry.js";

/** 验证错误 */
export interface ValidationError {
  field: string;
  message: string;
}

/** 验证结果 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const VALID_STATUSES: EntryStatus[] = [
  "planned",
  "in-progress",
  "completed",
  "reviewed",
  "archived",
];

const VALID_FILE_TYPES = ["log", "image", "pcap", "other"];

/**
 * 验证 EntryFile 数组
 */
function validateFiles(files: unknown, prefix: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Array.isArray(files)) {
    errors.push({ field: `${prefix}.files`, message: "必须是数组" });
    return errors;
  }

  for (let i = 0; i < files.length; i++) {
    const f = files[i] as Record<string, unknown>;
    const fp = `${prefix}.files[${i}]`;

    if (!f || typeof f !== "object") {
      errors.push({ field: fp, message: "必须是对象" });
      continue;
    }

    if (typeof f.name !== "string" || !f.name) {
      errors.push({ field: `${fp}.name`, message: "必须是非空字符串" });
    }
    if (typeof f.path !== "string" || !f.path) {
      errors.push({ field: `${fp}.path`, message: "必须是非空字符串" });
    }
    if (!VALID_FILE_TYPES.includes(f.type as string)) {
      errors.push({
        field: `${fp}.type`,
        message: `必须是以下之一: ${VALID_FILE_TYPES.join(", ")}`,
      });
    }
    if (typeof f.hash !== "string" || f.hash.length !== 64) {
      errors.push({ field: `${fp}.hash`, message: "必须是 64 位 SHA-256 十六进制字符串" });
    }
  }

  return errors;
}

/**
 * 验证完整的 Entry 元数据
 */
export function validateEntry(entry: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!entry || typeof entry !== "object") {
    errors.push({ field: "entry", message: "必须是对象" });
    return { valid: false, errors };
  }

  const e = entry as Record<string, unknown>;

  // 必填字符串字段（description 和 tester 可以为空）
  const requiredStrings: [string, string][] = [
    ["id", "id"],
    ["title", "title"],
    ["project", "project"],
    ["testType", "testType"],
    ["timestamp", "timestamp"],
    ["createdAt", "createdAt"],
    ["updatedAt", "updatedAt"],
  ];

  for (const [field, label] of requiredStrings) {
    if (typeof e[field] !== "string" || !e[field]) {
      errors.push({ field, message: `${label} 必须是非空字符串` });
    }
  }

  // ID 格式检查
  if (typeof e.id === "string" && !/^LST-\d{8}-\d{3}$/.test(e.id)) {
    errors.push({
      field: "id",
      message: "ID 格式必须为 LST-YYYYMMDD-NNN",
    });
  }

  // status
  if (!VALID_STATUSES.includes(e.status as EntryStatus)) {
    errors.push({
      field: "status",
      message: `必须是以下之一: ${VALID_STATUSES.join(", ")}`,
    });
  }

  // tags
  if (!Array.isArray(e.tags)) {
    errors.push({ field: "tags", message: "必须是数组" });
  } else {
    for (let i = 0; i < e.tags.length; i++) {
      if (typeof e.tags[i] !== "string") {
        errors.push({ field: `tags[${i}]`, message: "必须是字符串" });
      }
    }
  }

  // relatedEntries
  if (!Array.isArray(e.relatedEntries)) {
    errors.push({ field: "relatedEntries", message: "必须是数组" });
  }

  // environment (Record<string, string>)
  if (typeof e.environment !== "object" || !e.environment) {
    errors.push({ field: "environment", message: "必须是对象" });
  }

  // results (Record<string, number | string>)
  if (typeof e.results !== "object" || !e.results) {
    errors.push({ field: "results", message: "必须是对象" });
  }

  // files
  errors.push(...validateFiles(e.files, ""));

  return { valid: errors.length === 0, errors };
}

/**
 * 验证主索引结构
 */
export function validateMasterIndex(index: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!index || typeof index !== "object") {
    errors.push({ field: "index", message: "必须是对象" });
    return { valid: false, errors };
  }

  const idx = index as Record<string, unknown>;

  if (typeof idx.version !== "number") {
    errors.push({ field: "version", message: "必须是数字" });
  }
  if (!idx.entries || typeof idx.entries !== "object") {
    errors.push({ field: "entries", message: "必须是对象" });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 序列化 Entry 为 JSON 字符串（UTF-8, 美化格式）
 */
export function serializeEntry(entry: Entry): string {
  return JSON.stringify(entry, null, 2);
}

/**
 * 序列化索引为 JSON 字符串
 */
export function serializeIndex(index: MasterIndex): string {
  return JSON.stringify(index, null, 2);
}

/**
 * 安全解析 JSON 字符串
 */
export function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
