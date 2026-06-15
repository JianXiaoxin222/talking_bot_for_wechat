# Windows 微信个人号自动回复 Bot 计划

## Context

在 Windows 上构建一个微信个人号自动回复机器人，监听指定好友的消息，调用 DeepSeek LLM 生成回复，再自动发送回去。

核心约束：微信个人号**没有官方 API**。2026 年虽有 iLink/OpenClaw 官方通道但仅限 iOS 且生态不成熟。Windows 上最务实的方案是 **wxauto**（基于 Windows UI Automation），封号风险最低。

## 架构

```
微信 PC 客户端 (Windows GUI)
    ↓ (UI Automation)
 wxauto 轮询新消息
    ↓
 过滤目标好友
    ↓
 DeepSeek API (OpenAI SDK)
    ↓
 wxauto 发送回复
    ↓
微信 PC 客户端
```

## 关键发现

- **wxauto** (cluic/wxauto, ~4.4k stars): 基于 Windows UIAutomation，模拟人工操作，封号风险低。`pip install wxauto` 即可。
- 用户已有 DeepSeek API 调用经验（`deepseekstreamtest.py`），可复用 OpenAI SDK 方式。
- 当前目录在 WSL (`/mnt/d/codingbook/script`)，但 wxauto **必须在 Windows 原生 Python 中运行**（需要 Windows UI Automation）。代码可以直接通过 `D:\codingbook\script\` 路径在 Windows 端访问。

## 文件结构

```
script/
├── wechat_bot.py          # 主程序入口
├── config.py               # 配置：目标好友列表、API Key、模型参数
├── wechat_client.py        # wxauto 封装：获取消息、发送消息
├── llm_client.py           # DeepSeek API 封装
└── bot_logic.py            # 核心逻辑：消息过滤 → LLM 调用 → 回复
```

## 实现步骤

### 1. config.py — 配置管理
- `TARGET_FRIENDS`: 需要自动回复的好友昵称列表（精确匹配）
- `DEEPSEEK_API_KEY`: DeepSeek API 密钥
- `DEEPSEEK_MODEL`: 模型名（如 `deepseek-v4-pro`）
- `POLL_INTERVAL`: 轮询间隔（秒，建议 3-5 秒）
- `SYSTEM_PROMPT`: LLM 的 system prompt

### 2. wechat_client.py — 微信操作封装
- 初始化 wxauto，连接到微信 PC 客户端
- `get_new_messages()`: 获取当前聊天窗口的新消息，返回列表
- `send_message(who, text)`: 向指定好友发送消息
- `switch_chat(who)`: 切换到指定好友的聊天窗口
- 关键：微信窗口不能最小化，必须可见

### 3. llm_client.py — DeepSeek API 封装
- 复用现有 `deepseekstreamtest.py` 的调用方式（OpenAI SDK + DeepSeek base_url）
- `generate_reply(user_message, chat_history)`: 传入用户消息和上下文，返回 LLM 回复
- 支持流式输出（stream=True）
- 保留 reasoning_effort="high" 和 thinking 模式

### 4. bot_logic.py — 核心逻辑
- 主循环：每隔 POLL_INTERVAL 秒轮询
- 遍历目标好友列表，切换到每个好友窗口
- 获取该好友的新消息
- 调用 LLM 生成回复
- 发送回复

### 5. wechat_bot.py — 入口
- 加载配置
- 初始化各模块
- 启动主循环

## 注意事项

1. **微信窗口必须保持可见** — wxauto 依赖 Windows UI Automation，最小化后无法工作
2. **微信版本** — 推荐 3.9.x 版本，微信 4.0+ 可能需要 `wxauto4` 分支
3. **封号风险** — wxauto 模拟人工操作，风险较低，但仍建议用**副号**
4. **消息去重** — 需要记录已处理的消息 ID，避免重复回复
5. **运行环境** — 必须在 Windows 原生 Python 中运行，不能在 WSL 中运行（但代码可放在共享目录）

## 验证方式

1. 在 Windows 上安装 Python 3.x 和依赖：`pip install wxauto openai`
2. 打开微信 PC 客户端并登录
3. 修改 `config.py` 填入目标好友昵称和 API Key
4. 运行 `python wechat_bot.py`
5. 用另一台设备向目标微信发送消息，观察是否自动回复
