# LogStash — 压测日志分析缓存文档系统

## 项目概述

这是一个统一的压测日志管理 CLI 工具，支持多格式附件（日志/图片/PCAP），提供快速搜索（索引搜索 + 全文倒排索引），通过 Git + Git LFS 实现版本管理和团队分发。

## 项目结构

```
src/
├── main.ts                  # CLI 入口（Commander.js）
├── types/
│   ├── entry.ts             # 核心数据模型: Entry, IndexEntry, MasterIndex
│   ├── config.ts            # Stash 配置模型
│   └── index.ts             # 类型导出
├── core/
│   ├── entry.ts             # Entry CRUD（创建/读取/更新/删除）
│   ├── file-manager.ts      # 文件管理（复制/哈希/类型检测）
│   ├── id-generator.ts      # Entry ID 生成器 (LST-YYYYMMDD-NNN)
│   ├── index-manager.ts     # 主索引管理 + 标签索引
│   ├── metadata.ts          # 元数据验证与序列化
│   └── stash.ts             # Stash 初始化与配置
├── commands/
│   ├── init.ts              # logstash init
│   ├── add.ts               # logstash add
│   ├── list.ts              # logstash list
│   ├── get.ts               # logstash get
│   ├── update.ts            # logstash update
│   ├── delete.ts            # logstash delete
│   ├── search.ts            # logstash search
│   ├── export.ts            # logstash export
│   ├── git.ts               # logstash git
│   ├── validate.ts          # logstash validate
│   └── rebuild.ts           # logstash rebuild-index
├── search/
│   ├── engine.ts            # Tier 1 索引搜索
│   └── inverted-index.ts    # Tier 2 全文倒排索引（bigram 中文分词）
└── utils/
    ├── cli.ts               # CLI 输出：表格/颜色/格式化
    ├── file-type.ts         # 文件类型检测
    ├── fs.ts                # 文件系统帮助函数
    ├── hash.ts              # SHA-256 哈希
    └── time.ts              # 时间工具函数

skill/
└── SKILL.md                 # Claude Code Skill 定义

web/                          # 未来的 Web UI (Phase 2)
```

## 关键命令

```bash
npm run build          # TypeScript 编译 → dist/
npm run dev            # watch 模式
npm run lint           # 类型检查（不输出）
node dist/main.js      # 运行 CLI
```

## 测试

```bash
# 完整的端到端测试（在独立目录中）：
mkdir test-stash && cd test-stash
node ../dist/main.js init --project "test"
node ../dist/main.js add <file> --title "测试" --type "throughput"
node ../dist/main.js list
node ../dist/main.js search "测试"
node ../dist/main.js get LST-YYYYMMDD-001
node ../dist/main.js export LST-YYYYMMDD-001
node ../dist/main.js validate
node ../dist/main.js rebuild-index --fulltext
```

## 架构要点

- **数据一致性**：Entry CRUD 同时维护 4 个数据结构：metadata.json、index.json、inverted-index.json、tags.json
- **索引可重建**：所有索引都是 metadata.json 的缓存，可随时通过 `rebuild-index` 重建
- **中文分词**：bigram（二元组）方案，无需外部依赖
- **Git 策略**：metadata JSON 走 Git，大文件走 Git LFS
