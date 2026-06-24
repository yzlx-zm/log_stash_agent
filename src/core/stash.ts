/**
 * Stash 初始化与配置管理
 *
 * 设计目的:
 * - `logstash init` 的核心逻辑：在目标目录创建完整的 stash 结构
 * - 管理 .logstash/config.json 的读写
 * - 创建 Git 友好的模板文件
 *
 * 为什么 stash 可以放在任意目录？
 * - 不同项目的压测日志应该放在各自的项目目录下
 * - 不强制全局数据库，每个 stash 独立、便携
 * - 方便通过 Git 按项目分发
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { exists, ensureDir } from "../utils/fs.js";
import { DEFAULT_CONFIG, type LogStashConfig } from "../types/config.js";
import { parseJson } from "./metadata.js";

/** stash 系统目录名 */
export const STASH_DIR = ".logstash";
/** entries 目录名 */
export const ENTRIES_DIR = "entries";

/** stash 内各文件的相对路径 */
export const PATHS = {
  config: ".logstash/config.json",
  index: ".logstash/index.json",
  invertedIndex: ".logstash/inverted-index.json",
  tags: ".logstash/tags.json",
  lock: ".logstash/index.lock",
  entries: "entries",
  gitignore: ".gitignore",
  gitattributes: ".gitattributes",
  readme: "README.md",
} as const;

/**
 * 在指定目录初始化 stash
 *
 * 创建:
 * - .logstash/ 目录及 config.json
 * - entries/ 目录
 * - .gitignore 和 .gitattributes 模板（如果不存在）
 *
 * @param rootDir - stash 根目录（默认当前目录）
 * @param projectName - 默认项目名称
 * @returns 初始化结果
 */
export async function initStash(
  rootDir: string,
  projectName: string = ""
): Promise<{
  created: string[];
  skipped: string[];
}> {
  const created: string[] = [];
  const skipped: string[] = [];

  // 创建 .logstash/ 目录
  const stashDir = resolve(rootDir, STASH_DIR);
  if (!(await exists(stashDir))) {
    await mkdir(stashDir);
    created.push(STASH_DIR);
  } else {
    skipped.push(STASH_DIR);
  }

  // 创建 entries/ 目录
  const entriesDir = resolve(rootDir, ENTRIES_DIR);
  if (!(await exists(entriesDir))) {
    await mkdir(entriesDir);
    created.push(ENTRIES_DIR);
  } else {
    skipped.push(ENTRIES_DIR);
  }

  // 写入 config.json
  const configPath = resolve(rootDir, PATHS.config);
  const config: LogStashConfig = {
    ...DEFAULT_CONFIG,
    projectName: projectName || DEFAULT_CONFIG.projectName,
  };

  if (!(await exists(configPath))) {
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    created.push(PATHS.config);
  } else {
    skipped.push(PATHS.config);
  }

  // 创建初始的空索引
  const indexJson = {
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
  const indexPath = resolve(rootDir, PATHS.index);
  if (!(await exists(indexPath))) {
    await writeFile(indexPath, JSON.stringify(indexJson, null, 2), "utf-8");
    created.push(PATHS.index);
  } else {
    skipped.push(PATHS.index);
  }

  // 初始化空倒排索引
  const invIndexPath = resolve(rootDir, PATHS.invertedIndex);
  if (!(await exists(invIndexPath))) {
    await writeFile(
      invIndexPath,
      JSON.stringify(
        { version: 1, fields: ["title", "description"], docs: 0, terms: {} },
        null,
        2
      ),
      "utf-8"
    );
    created.push(PATHS.invertedIndex);
  } else {
    skipped.push(PATHS.invertedIndex);
  }

  // 初始化 tags.json
  const tagsPath = resolve(rootDir, PATHS.tags);
  if (!(await exists(tagsPath))) {
    await writeFile(tagsPath, JSON.stringify({}, null, 2), "utf-8");
    created.push(PATHS.tags);
  } else {
    skipped.push(PATHS.tags);
  }

  // 创建 .gitignore 模板（不覆盖已有文件）
  const giPath = resolve(rootDir, PATHS.gitignore);
  if (!(await exists(giPath))) {
    const gitignoreContent = `# LogStash — stash 文件忽略规则
# 二进制大文件应通过 Git LFS 管理（见 .gitattributes）

# 保留元数据文件在 Git 中
# （.logstash/*.json 和 entries/**/metadata.json 自动跟踪）

node_modules/
dist/
`;
    await writeFile(giPath, gitignoreContent, "utf-8");
    created.push(PATHS.gitignore);
  } else {
    skipped.push(PATHS.gitignore);
  }

  // 创建 .gitattributes 模板
  const gaPath = resolve(rootDir, PATHS.gitattributes);
  if (!(await exists(gaPath))) {
    const gaContent = `# LogStash — Git LFS 规则（二进制文件用 LFS，Git 只存指针）
*.log filter=lfs diff=lfs merge=lfs -text
*.pcap filter=lfs diff=lfs merge=lfs -text
*.pcapng filter=lfs diff=lfs merge=lfs -text
*.png filter=lfs diff=lfs merge=lfs -text
*.jpg filter=lfs diff=lfs merge=lfs -text
*.jpeg filter=lfs diff=lfs merge=lfs -text
*.bmp filter=lfs diff=lfs merge=lfs -text
*.zip filter=lfs diff=lfs merge=lfs -text
*.tar.gz filter=lfs diff=lfs merge=lfs -text
*.7z filter=lfs diff=lfs merge=lfs -text
`;
    await writeFile(gaPath, gaContent, "utf-8");
    created.push(PATHS.gitattributes);
  } else {
    skipped.push(PATHS.gitattributes);
  }

  return { created, skipped };
}

/**
 * 读取 stash 配置
 */
export async function readConfig(rootDir: string): Promise<LogStashConfig> {
  const configPath = resolve(rootDir, PATHS.config);
  if (!(await exists(configPath))) {
    throw new Error(
      `不是有效的 stash（缺少 ${PATHS.config}），请先运行: logstash init`
    );
  }
  const raw = await readFile(configPath, "utf-8");
  const config = parseJson<LogStashConfig>(raw);
  if (!config) {
    throw new Error(`${PATHS.config} 格式无效`);
  }
  return config;
}

/**
 * 更新 stash 配置
 */
export async function updateConfig(
  rootDir: string,
  partial: Partial<LogStashConfig>
): Promise<LogStashConfig> {
  const config = await readConfig(rootDir);
  const updated = { ...config, ...partial };
  const configPath = resolve(rootDir, PATHS.config);
  await writeFile(configPath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

/**
 * 查找当前目录或祖先目录中的 stash 根目录
 * 从 startDir 向上搜索，直到找到 .logstash/ 目录
 *
 * @returns stash 根目录的绝对路径，找不到返回 null
 */
export async function findStashRoot(
  startDir: string
): Promise<string | null> {
  let current = resolve(startDir);
  const root = resolve("/");

  while (current !== root) {
    if (await exists(resolve(current, STASH_DIR))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }

  // 最后检查根目录
  if (await exists(resolve(root, STASH_DIR))) {
    return root;
  }

  return null;
}
