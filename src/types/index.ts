/**
 * 类型导出索引
 * 所有公共类型统一从这里导出
 */

export type {
  FileType,
  EntryStatus,
  EntryFile,
  Entry,
  IndexEntry,
  MasterIndex,
  TermDocInfo,
  InvertedTerm,
  InvertedIndex,
} from "./entry.js";

export type { LogStashConfig } from "./config.js";
export { DEFAULT_CONFIG } from "./config.js";
