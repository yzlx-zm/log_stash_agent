# LogStash — 压测日志分析缓存文档系统

统一的压测日志/图片/PCAP 文件管理、搜索与文档化工具，提供 HTML 可视化 Web 界面。

## 功能特性

- **HTML Web 界面** — 浏览器操作，无需记命令
- **多格式支持** — .log / .txt / .pcap / .pcapng / .png / .jpg 等 50+ 文件类型
- **文件夹上传** — 拖拽整个目录，保留原始目录结构
- **关键文件标记** — ⭐ 标记重点文件，快速定位
- **全文搜索** — Bigram 中文分词 + 自建倒排索引，支持中英文混合搜索
- **索引搜索** — 按项目 / 类型 / 标签 / 状态 / 日期范围过滤
- **Markdown / HTML 导出** — 一键生成测试报告
- **纯本地运行** — 零云端依赖，数据完全在本地
- **Git + LFS** — 源码 Git 版本管理，大文件 Git LFS 跟踪

## 快速开始

```bash
# 1. 克隆
git clone https://github.com/yzlx-zm/log_stash_agent.git
cd log_stash_agent
npm install

# 2. 双击 start.bat 一键启动
#    或者命令行：node dist/main.js serve --port 3000

# 3. 浏览器自动打开 http://localhost:3000
```

首次启动会自动初始化 stash，无需额外配置。

> 💡 **最简单用法**：把 `start.bat` 复制到你的压测日志目录，双击即可。

## Web 界面操作

| 操作 | 方式 |
|------|------|
| 添加记录 | 右侧表单填写标题/项目/类型，拖拽文件/文件夹，点"添加记录" |
| 搜索 | 顶部搜索栏输入关键词，可选项目/类型/状态过滤 + 全文搜索 |
| 查看详情 | 点击列表中的条目 |
| 编辑 | 详情弹窗中点击"编辑"，表单式修改全部字段 |
| 标记关键文件 | 详情中点击文件名旁的 ☆ → ⭐ |
| 删除 | 详情弹窗中点击"删除"，确认后不可逆 |
| 清理原文件 | 勾选"入库后删除原始文件"，节省磁盘空间 |

## 存储结构

```
<stash-root>/
├── .logstash/              # 系统配置 + 索引（自动管理）
│   ├── config.json
│   ├── index.json          # 主索引（可重建）
│   └── inverted-index.json # 全文倒排索引（可重建）
├── entries/                # 所有压测记录
│   └── LST-20260624-001/
│       ├── metadata.json   # 元数据
│       ├── notes.md        # 笔记（可选）
│       └── files/          # 附件（保留目录结构）
└── .gitattributes          # Git LFS 配置
```

## CLI 命令参考

```bash
logstash init --project "项目名"              # 初始化 stash
logstash serve --port 3000                    # 启动 Web 界面
logstash add <files> --title "标题" --type "类型"  # CLI 添加记录
logstash search "关键词" --fulltext            # 全文搜索
logstash list --project "项目名"               # 列出条目
logstash get <ID>                             # 查看详情
logstash export <ID> --format markdown         # 导出报告
logstash rebuild-index --fulltext             # 重建索引
logstash validate                             # 校验数据完整性
```

## 索引重建

所有索引都是 `metadata.json` 的缓存，可随时重建：

```bash
logstash rebuild-index --fulltext
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vanilla HTML/CSS/JS (零框架) |
| 后端 | Node.js 22 + Express 5 + TypeScript 5.6 |
| 搜索 | 自建倒排索引 + Bigram 中文分词 |
| CLI | Commander.js |
| 文件 | Multer (上传) + SHA-256 (去重) |

## 安全

- 纯本地运行，无出站网络连接
- 路径遍历防护（Entry ID 正则校验 + 文件路径安全检查）
- XSS 防护（用户输入 HTML 转义）
- 文件上传白名单（50+ 安全类型）
- 错误消息脱敏（不泄露内部路径）

## 开发

```bash
npm install
npm run build          # 编译
npm run dev            # 监听模式
node dist/main.js --help
```

## License

MIT
