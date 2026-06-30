/**
 * 压测日志条目 — 核心数据模型
 *
 * 设计目的:
 * - project + testType 作为一级分类维度，解决"不同项目日志繁多、分类不清"的痛点
 * - tags 提供灵活的自定义分类
 * - environment + results 使用 key-value map，适应不同测试类型的参数差异
 * - status 支持工作流生命周期管理
 * - relatedEntries 支持复测/关联分析的追溯
 */

/** 文件类型枚举 */
export type FileType = "log" | "image" | "pcap" | "other";

/** 条目状态 */
export type EntryStatus =
  | "planned"
  | "in-progress"
  | "completed"
  | "reviewed"
  | "archived";

/** 单条附件的描述 */
export interface EntryFile {
  /** 原始文件名 (如 "app_log_001.log") */
  name: string;
  /** 相对于 entry 目录的路径 (如 "files/app_log_001.log") */
  path: string;
  /** 文件类型分类 */
  type: FileType;
  /** MIME 类型 (如 "application/vnd.tcpdump.pcap") */
  mimeType: string;
  /** 文件大小（字节） */
  size: number;
  /** SHA-256 哈希值（用于去重） */
  hash: string;
  /** 添加时间 (ISO 8601) */
  addedAt: string;
  /** 是否标记为关键文件（用于快速定位） */
  key: boolean;
}

/** 一条压测记录（Entry） */
export interface Entry {
  /** 唯一标识符，格式: "LST-YYYYMMDD-NNN" */
  id: string;
  /** 简短标题 (支持中文) */
  title: string;
  /** 所属项目名称 (主要分类轴) */
  project: string;
  /** 测试类型: throughput, latency, stability, connection-drop 等 */
  testType: string;
  /** 测试人员 */
  tester: string;
  /** 测试执行时间 (ISO 8601) */
  timestamp: string;
  /** 灵活标签 (支持中文) */
  tags: string[];
  /** 详细描述 (支持中文和 Markdown) */
  description: string;
  /** 工作流状态 */
  status: EntryStatus;
  /** 环境参数: 固件版本、硬件型号、信道等 */
  environment: Record<string, string>;
  /** 测试结果: 吞吐量、丢包率、延迟等数值 */
  results: Record<string, number | string>;
  /** 关联的其他 Entry ID */
  relatedEntries: string[];
  /** 原始文件来源目录（用于清理时扫描，为空则用 stash 根目录） */
  sourceDir?: string;
  /** 附件列表 */
  files: EntryFile[];
  /** 创建时间 (ISO 8601) */
  createdAt: string;
  /** 最后更新时间 (ISO 8601) */
  updatedAt: string;
}

/** 索引条目 — 存储在 index.json 中的精简版元数据 */
export interface IndexEntry {
  id: string;
  title: string;
  project: string;
  testType: string;
  timestamp: string;
  tags: string[];
  status: EntryStatus;
  /** 附件数量 */
  fileCount: number;
  /** 附件类型汇总: ["log", "pcap", "image"] */
  fileTypes: string[];
  createdAt: string;
}

/** 主索引 */
export interface MasterIndex {
  version: number;
  entries: Record<string, IndexEntry>;
  counts: {
    total: number;
    byProject: Record<string, number>;
    byTestType: Record<string, number>;
    byStatus: Record<string, number>;
    byTag: Record<string, number>;
  };
  lastUpdated: string;
}

/** 倒排索引中的词条信息 */
export interface TermDocInfo {
  /** 词频 (term frequency) */
  tf: number;
  /** 该词出现在哪些字段中 */
  fields: string[];
}

/** 倒排索引中的词条 */
export interface InvertedTerm {
  count: number;
  docs: Record<string, TermDocInfo>;
}

/** 倒排索引 */
export interface InvertedIndex {
  version: number;
  /** 被索引的字段列表 */
  fields: string[];
  /** 文档总数 */
  docs: number;
  /** 词 → 文档映射 */
  terms: Record<string, InvertedTerm>;
}
