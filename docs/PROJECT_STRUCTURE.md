# 文档目录与代码结构

本文用于快速说明当前仓库的文档入口、代码目录和核心实现边界，方便后续维护、交接和发布。

## 文档目录

| 路径 | 说明 |
| --- | --- |
| `README.md` | 项目入口说明，包含功能概览、演示截图、启动方式、目录结构和使用流程 |
| `docs/PROJECT_STRUCTURE.md` | 当前文件，梳理文档目录、代码结构、数据模型和维护建议 |
| `docs/DEPLOYMENT.md` | Windows / 麒麟 Linux 下基于 Nginx 的部署与更新说明 |
| `docs/CHANGELOG.md` | Markdown 版更新记录 |
| `docs/assets/screenshots/` | README 使用的系统演示截图 |

## 代码目录

```text
src/
├── main.jsx       # React 挂载入口
├── App.jsx        # 主应用逻辑
├── index.css      # Tailwind 引入和当前主样式
├── App.css        # 甘特图补充样式
└── assets/        # Vite 默认示例资源

public/
├── celebration-bg.png  # 庆功页背景图
└── vite.svg            # Vite 默认静态资源

docs/
├── PROJECT_STRUCTURE.md
├── DEPLOYMENT.md
├── CHANGELOG.md
└── assets/
    └── screenshots/    # README 系统演示截图
```

生产应用入口为 `index.html` 和 `src/main.jsx`。根目录只保留源码入口、配置文件和项目级说明，截图等文档资源统一放在 `docs/assets/` 下。

## App.jsx 结构

`src/App.jsx` 是当前项目的核心文件，主要职责包括：

- 时间工具：日期格式化、本地时间与 ISO 时间转换、分钟/秒差计算。
- 数据解析：CSV 解析、Excel 解析、JSON 导入、Excel 模板下载、执行数据导出。
- 任务调度：根据计划时间、实际时间和依赖关系计算甘特图展示位置。
- 状态判断：任务是否可启动、是否被依赖阻塞、是否延期风险、是否超时、是否提前开始。
- 大屏交互：配置区切换、甘特图全屏、定位当前任务/当前时间、搜索和状态筛选。
- 执行操作：启动任务、完成任务、批量启动、批量完成、清空任务执行状态。
- 展示层：总览卡片、阶段进度、甘特图、下一步任务、阻塞任务、操作记录、庆功页。

当前实现为单文件主应用，后续若继续扩展，建议优先拆分以下模块：

- `src/utils/time.js`：时间解析和格式化。
- `src/utils/importExport.js`：Excel、CSV、JSON 导入导出。
- `src/utils/scheduler.js`：任务依赖、排期、甘特图 lane 计算。
- `src/components/`：配置区、甘特图、任务列表、操作记录、庆功页。

## 核心数据模型

任务对象主要字段如下：

| 字段 | 说明 |
| --- | --- |
| `id` | 任务 ID，依赖关系使用该字段引用 |
| `phase` | 阶段名称 |
| `name` | 工作项名称 |
| `estMinutes` | 预计耗时，单位分钟 |
| `planStart` | 计划开始时间，ISO 字符串 |
| `planEnd` | 计划结束时间，ISO 字符串 |
| `leader` | 牵头人 |
| `owner` | 执行人 |
| `checker` | 检查人 |
| `dependsOn` | 前置任务 ID 数组 |
| `status` | 任务状态：`planned`、`ongoing`、`done` |
| `actualStart` | 实际开始时间 |
| `actualEnd` | 实际结束时间 |
| `actualMinutes` | 实际耗时，单位分钟 |
| `scheduledStart` | 根据依赖关系计算出的展示开始时间 |

## 本地存储

应用使用浏览器 `localStorage` 保存现场状态。主要 key：

| key | 说明 |
| --- | --- |
| `ioa_tasks` | 当前任务数据 |
| `ioa_logs` | 操作记录 |
| `ioa_window_start` | 升级窗口开始时间 |
| `ioa_window_end` | 升级窗口结束时间 |
| `ioa_countdown` | 是否使用倒计时模式 |
| `ioa_project_title` | 大屏标题 |
| `ioa_enable_upcoming_alert` | 即将开始提醒开关 |
| `ioa_hide_completed_overdue` | 已完成任务是否隐藏超时效果 |
| `ioa_logs_collapsed` | 操作记录是否折叠 |
| `ioa_demo_time_enabled` | 演示时间模式开关 |
| `ioa_demo_time` | 演示时间 |

## 数据流

1. 通过 Excel、CSV、JSON 导入任务计划。
2. 导入逻辑标准化字段、时间和依赖关系。
3. `scheduleTasks` 根据依赖任务结束时间计算展示开始时间。
4. 大屏按阶段、状态、搜索条件和当前时间渲染任务。
5. 现场操作启动/完成任务，并写入操作记录。
6. 所有任务和日志同步写入 `localStorage`。
7. 升级结束后可导出 JSON 或含实际执行数据的 Excel。

## 维护建议

- 源码仓库只提交源码、文档和必要静态资源，不提交 `node_modules/`、`dist/`、`dist.zip` 等构建产物。
- 业务功能调整后同步更新 `README.md`、`docs/PROJECT_STRUCTURE.md`、`docs/DEPLOYMENT.md` 和 `docs/CHANGELOG.md`。
- 修改导入字段时，同时更新 README 的字段表、Excel 模板逻辑和导出逻辑。
- 修改任务状态或依赖逻辑时，重点验证启动任务、完成任务、批量操作、阻塞提示和甘特图展示。
