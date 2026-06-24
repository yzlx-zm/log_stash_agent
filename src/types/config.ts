/**
 * 系统配置 — stash 级别的全局设置
 *
 * 设计目的:
 * - 每个 stash 独立配置，不同项目可以有不同默认值
 * - 纯 JSON 格式，Git 友好，可 diff
 * - version 字段用于未来的 schema 迁移
 */

export interface LogStashConfig {
  /** Schema 版本号，用于未来的迁移 */
  version: number;
  /** 默认项目名称 */
  projectName: string;
  /** Entry ID 格式模板 */
  entryIdFormat: string;
  /** 新建条目的默认状态 */
  defaultStatus: string;
  /** 是否允许相同哈希的重复文件（false=自动去重） */
  allowDuplicateHashes: boolean;
  /** 是否使用 Git LFS 管理二进制文件 */
  gitLfs: boolean;
  /** 所有已知标签列表（用于自动补全和一致性检查） */
  tags: string[];
  /** 所有已知测试类型列表 */
  testTypes: string[];
}

/** 默认配置 */
export const DEFAULT_CONFIG: LogStashConfig = {
  version: 1,
  projectName: "",
  entryIdFormat: "LST-{date}-{seq}",
  defaultStatus: "planned",
  allowDuplicateHashes: false,
  gitLfs: false,
  tags: [],
  testTypes: [
    "throughput",
    "latency",
    "stability",
    "connection-drop",
    "packet-loss",
    "bandwidth",
    "stress",
    "regression",
    "other",
  ],
};
