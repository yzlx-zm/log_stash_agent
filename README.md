# LogStash — 压测日志分析缓存文档系统

统一的压测日志/图片/PCAP 文件管理、搜索与文档化工具。

## 核心功能

- **HTML 可视化界面**: 浏览器中拖拽上传、搜索、管理，无需记命令
- **多格式支持**: 原始日志(.log)、截图(.png/.jpg)、PCAP 抓包(.pcap/.pcapng)
- **快速搜索**: 索引搜索 + 全文倒排索引，支持中英文关键词
- **Agent 驱动**: 通过 Claude Code Skill 用自然语言操作
- **离线可用**: 无需云端服务，纯本地运行

## 使用方式（HTML 网页）

### 1. 编译

```bash
cd log_stash_agent
npm install
npm run build
```

### 2. 在你的压测项目目录初始化

```bash
cd ~/projects/my-test-project
node /path/to/log_stash_agent/dist/main.js init --project "项目名称"
```

### 3. 启动 Web 界面

```bash
node /path/to/log_stash_agent/dist/main.js serve --port 3000
```

### 4. 打开浏览器

访问 **http://localhost:3000** 即可使用：

- 右侧表单填写信息 + 拖拽上传文件 → 点击"添加记录"
- 顶部搜索栏输入关键词 → 支持项目/类型/状态过滤 + 全文搜索
- 点击列表中的条目 → 查看详情、编辑、删除

## 存储结构

```
<stash-root>/
├── .logstash/          # 系统配置和索引
├── entries/            # 所有条目（按 ID 扁平存放）
│   └── LST-XXXXXX-XXX/
│       ├── metadata.json
│       ├── notes.md
│       └── files/      # 附件
└── .gitattributes      # Git LFS 配置
```

## CLI 备用方式

```bash
logstash init --project "demo"              # 初始化
logstash add test.log capture.pcap          # 添加记录
  --title "吞吐量测试" --type "throughput"
logstash search "吞吐量"                    # 搜索
logstash get LST-20260624-001               # 查看详情
logstash export LST-20260624-001            # 导出 Markdown
logstash rebuild-index --fulltext           # 重建索引
```

## 技术栈

- TypeScript + Node.js + Express
- 自建倒排索引 + bigram 中文分词（零外部搜索依赖）
- Commander.js (CLI)

## 开发

```bash
npm install
npm run build     # 编译
npm run dev       # 监听模式
```
