# pi-web 设计文档

Web 前端 for pi coding agent，基于官方 RPC 模式（`pi --mode rpc`，JSONL over stdin/stdout）。视觉参考 deepseek-harness 前端：深色主题、紧凑工具卡片、流式渲染。

第一版范围（用户已确认）：最小可用版 + 模型可视化配置。

## 总体架构

```
~/IdeaProjects/pi-web/
├── server/          # Node + TS（tsx 运行），端口 3210
│   └── src/
│       ├── main.ts          # 启动 HTTP 服务：静态文件 + WebSocket
│       ├── rpc-client.ts    # spawn `pi --mode rpc`，JSONL 收发、请求 id 关联
│       └── bridge.ts        # WebSocket ⇄ RPC 桥接
├── web/             # React 18 + Vite + TS
│   └── src/
│       ├── App.tsx
│       ├── store.ts         # useReducer：RPC 事件 → 消息列表状态
│       └── components/
│           ├── ChatView.tsx      # 消息列表 + 自动滚动
│           ├── Markdown.tsx      # 流式 markdown（react-markdown）
│           ├── ToolCallCard.tsx  # 工具卡片：名称/参数/输出/状态，可折叠
│           ├── Composer.tsx      # 输入框、发送、停止、重新生成
│           ├── StatusBar.tsx     # 模型名、会话 ID、流式状态、模型配置入口
│           └── ModelConfig.tsx   # 模型可视化配置面板
└── shared/protocol.ts   # 用到的 RPC 类型子集
```

### 生命周期

- 每个 WebSocket 连接 spawn 一个独立 pi 进程（每个浏览器标签页一个会话，互不干扰）
- WS 断开时 kill 对应 pi 子进程
- pi 会话文件照常落盘到其 cwd；v1 不做历史会话恢复（刷新 = 新会话）

### 配置（env / CLI flag）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3210` | HTTP/WS 端口 |
| `PI_CMD` | pi 仓库的 tsx experimental cli | pi 启动命令 |
| `PI_CWD` | `$HOME/IdeaProjects/pi` | pi 工作目录（会话落盘位置） |

## 数据流

- 浏览器 → WS `{id, command, ...}` → server 按 RPC 分帧规则（仅 LF 分帧，不用通用 readline）写 pi stdin
- pi stdout → server：`type: "response"` 按 `id` 关联回传给发起者；其余 event 广播到该连接
- 浏览器本地请求 id 自增生成

### v1 使用的 RPC 命令

| 命令 | 用途 |
|---|---|
| `get_state` | 连接后初始化：模型、thinkingLevel、isStreaming、sessionId |
| `get_messages` | 初始化消息列表 |
| `prompt` | 发送用户消息 |
| `abort` | 停止当前流 |
| `new_session` | 新会话按钮 |
| `get_available_models` | 模型配置面板：列出全部已配置模型 |
| `set_model` | 切换模型（provider + modelId） |
| `get_available_thinking_levels` | 当前模型支持的 thinking 档位 |
| `set_thinking_level` | 设置 thinking 档位 |

### 事件映射

- `message_update`：增量追加到当前助手消息（text / thinking / toolcall 分支）
- `message_start` / `message_end`：消息生命周期
- `tool_execution_start` / `update` / `end`：按 toolCallId 归到工具卡片，流式刷新输出与状态
- `agent_start` / `agent_settled`：输入框锁定/解锁
- `auto_retry_start` / `end`、`compaction_start` / `end`：状态栏提示
- 已知简化：协议无原生 regenerate，重新生成 = 重发上一条用户消息文本

## 模型可视化配置（ModelConfig）

- 入口：StatusBar 点击当前模型名，弹出面板
- 当前模型信息：name、provider、contextWindow、input 类型、cost
- 模型列表：`get_available_models` 结果，按 provider 分组，支持模糊搜索（id + name），点击即 `set_model`
- Thinking 档位：`get_available_thinking_levels`（依赖当前模型），点击 `set_thinking_level`；切换模型后自动刷新
- 不在 v1 范围：编辑 API key、自定义 provider（pi 的文件配置），仅切换本次运行可用的模型

## UI 组件要点

- 深色主题，CSS 变量定义色板；等宽字体渲染代码块与工具输出
- 消息：用户消息右对齐块；助手消息全宽 markdown；thinking 内容折叠块
- 工具卡片：标题行（工具名 + 状态 icon），展开显示参数与输出，运行中有流式输出
- Composer：textarea（Enter 发送 / Shift+Enter 换行）、发送、停止（流式时）、重新生成、新会话
- 自动滚动：距底部近时跟随，用户上翻时暂停跟随并显示回到底部按钮

## 错误处理

- pi 进程崩溃/退出：server 推 `server_error` 事件，浏览器显示横幅 + 重连按钮；下次 WS 连接重新 spawn
- pi 输出非法 JSONL：server 记 console 日志、跳过该行
- RPC `success: false`：UI 顶部错误条显示 message
- WS 断开：自动重连（指数退避），成功后 `get_state` + `get_messages` 重建视图

## 测试

- `rpc-client`：node:test 单测，假 pi 脚本（echo JSONL 桩）验证 LF 分帧、id 关联、事件透传、子进程退出处理
- `store.ts` reducer：vitest 单测，事件序列（start/update/end、tool 事件）→ 期望状态
- 手动冒烟：启动脚本 + 假 pi 桩跑通一条完整对话流；真实 pi 下人工验证

## 依赖

全部精确锁版本：`react`、`react-dom`、`vite`、`@vitejs/plugin-react`、`typescript`、`ws`、`@types/ws`、`tsx`、`react-markdown`、`remark-gfm`、`rehype-highlight`、`highlight.js`。Node ≥ 22（与 pi 一致）。
