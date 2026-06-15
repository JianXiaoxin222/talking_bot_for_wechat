# 微信自动回复 Bot

基于键盘模拟 + 剪贴板 + DeepSeek API 的 Windows 微信自动回复机器人。

## 环境要求

- Windows 系统
- Python 3.12+
- 微信 PC 客户端（需登录且窗口可见）

## 快速开始

```powershell
# 1. 激活虚拟环境
.\.venv\Scripts\activate

# 2. 设置 DeepSeek API Key
$env:DEEPSEEK_API_KEY = "sk-xxx"

# 3. 打开微信并登录，保持窗口可见

# 4. 启动 Bot
python bot.py
```

## 文件说明

### `bot.py` — 主程序入口

| 函数 | 说明 |
|------|------|
| `main()` | 主循环。初始化微信窗口 → 导航到目标聊天 → 轮询检测新消息 → 调用 DeepSeek → 自动回复。按 `Ctrl+C` 停止。 |

配置常量（在文件顶部直接修改）：

| 常量 | 默认值 | 说明 |
|------|--------|------|
| `TARGET_CHAT` | `"文件传输助手"` | 要监听和回复的聊天对象 |
| `POLL_INTERVAL` | `3` | 基础轮询间隔（秒） |
| `FORCE_CHECK_INTERVAL` | `10` | 强制检查间隔（秒），即使未读数没变化 |
| `SYSTEM_PROMPT` | `"你是一个友好的助手..."` | 发给 DeepSeek 的 system prompt |

---

### `wechat_controller.py` — 微信窗口控制器

封装所有与微信窗口交互的操作。

#### 窗口管理

| 函数 | 说明 |
|------|------|
| `find_window()` | 通过 UIA 查找微信主窗口（类名 `Qt51514QWindowIcon`，标题含"微信"），返回 `(Control, HWND)`。找不到返回 `(None, 0)` |
| `ensure_window_visible()` | 确保微信窗口可见且在前台。如果窗口最小化则自动恢复。找不到窗口时抛出 `RuntimeError` |
| `get_unread_count()` | 通过 Win32 API 读取窗口标题（如 `微信(3)`），解析并返回未读消息数。是轻量级的新消息检测手段，不依赖 UIA |

#### 聊天操作

| 函数 | 说明 |
|------|------|
| `navigate_to_chat(name)` | 跳转到指定聊天。模拟 `Ctrl+F` → 粘贴名称 → `Enter`，等价于在微信搜索框搜索并进入聊天 |
| `copy_chat_messages()` | 点击聊天区域 → `Ctrl+A` 全选 → `Ctrl+C` 复制 → 返回剪贴板文本。获取当前聊天窗口的全部可见消息 |
| `get_last_message()` | 从复制的聊天记录中提取最后一条消息，返回 `(sender, content, hash)`。hash 用于去重判断 |
| `send_message(text)` | 向当前聊天窗口发送消息。`Ctrl+V` 粘贴 → `Enter` 发送 |
| `is_my_message(sender)` | 判断消息是否为自己发出的（避免循环回复）。如果 sender 为空或等于自己的昵称，则返回 `True` |

#### 辅助函数

| 函数 | 说明 |
|------|------|
| `_find_wechat_window()` | 内部函数。遍历 UIA 根窗口的所有子窗口，匹配微信窗口 |
| `_get_hwnd(control)` | 从 UIA Control 对象提取原生 Win32 HWND |
| `_restore_and_focus(hwnd)` | 调用 Win32 `ShowWindow` + `SetForegroundWindow` 恢复并聚焦窗口 |
| `_get_window_title()` | 通过 Win32 `EnumWindows` 枚举所有窗口，找到微信并返回其标题 |
| `_parse_unread_count(title)` | 从标题字符串（如 `微信(3)`）中正则提取未读数 |
| `_click_chat_area()` | 点击聊天消息区域（避免焦点卡在输入框），为复制消息做准备 |
| `_safe_str(val)` | 安全类型转换，处理 ctypes 返回值 |

---

### `llm_client.py` — DeepSeek API 客户端

| 函数 | 说明 |
|------|------|
| `get_client()` | 创建并返回 OpenAI SDK 客户端实例，连接 DeepSeek API（`api.deepseek.com`）。API Key 从环境变量 `DEEPSEEK_API_KEY` 读取 |
| `chat(user_message, system_prompt)` | 调用 `deepseek-chat` 模型。传入用户消息和可选的 system prompt，返回模型回复文本 |

---

## 工作原理

```
┌─────────────────┐
│ 开始             │
└────────┬────────┘
         ↓
┌─────────────────┐
│ 查找微信窗口      │ ← find_window() / ensure_window_visible()
└────────┬────────┘
         ↓
┌─────────────────┐
│ 导航到目标聊天    │ ← navigate_to_chat("文件传输助手")
└────────┬────────┘
         ↓
   ┌─────────────┐
   │  主循环      │
   └──────┬──────┘
          ↓
   ┌─────────────────────┐
   │ 检测新消息            │
   │ ① 窗口标题未读数变化  │ ← get_unread_count()
   │ ② 或超时强制检查     │
   └──────────┬──────────┘
              ↓ (有新消息)
   ┌─────────────────────┐
   │ 复制聊天消息          │ ← copy_chat_messages() → get_last_message()
   └──────────┬──────────┘
              ↓
   ┌─────────────────────┐
   │ 判断是否自己的消息    │ ← is_my_message()
   └──────────┬──────────┘
              ↓ (不是)
   ┌─────────────────────┐
   │ 调用 DeepSeek API    │ ← llm_client.chat()
   └──────────┬──────────┘
              ↓
   ┌─────────────────────┐
   │ 发送回复             │ ← send_message()
   └──────────┬──────────┘
              ↓
         回到主循环
```

## 注意事项

1. **微信必须可见**：键盘模拟依赖消息发送到前台窗口，微信最小化到托盘时会自动恢复
2. **不要手动操作**：Bot 运行时不要同时操作微信，避免键盘输入冲突
3. **API Key 安全**：不要在代码中硬编码 API Key，始终使用环境变量
4. **微信版本**：当前适配微信 4.1.x（窗口类名 `Qt51514QWindowIcon`）
