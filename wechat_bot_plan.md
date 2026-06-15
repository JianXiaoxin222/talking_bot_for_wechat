# 微信自动回复 Bot（键盘 + 剪贴板 + DeepSeek）

## Context

放弃 wxauto4（不兼容微信 4.1.10.31），改用**键盘模拟 + 剪贴板 + DeepSeek API** 实现微信自动回复。

- DeepSeek API key：已有，模型用 `deepseek-chat`
- 检测策略：窗口标题监控 + 内容轮询结合
- 窗口要求：尽量后台运行，操作时自动恢复窗口

## 执行步骤

### Step 1: 环境清理
- 创建 `.venv` 虚拟环境
- 卸载全局 pip 包：`wxauto4`、`uiautomation`、`comtypes`
- 更新 `.gitignore`：追加 `.venv/`、`__pycache__/`、`*.exe`、`wx_trigger.cs`、`check_wx.py`

### Step 2: 虚拟环境安装依赖
- `.venv` 内安装：`pyautogui`、`pyperclip`、`uiautomation`、`openai`

### Step 3: Git 提交 + 推送

### Step 4: 编写代码

| 文件 | 内容 |
|------|------|
| `wechat_controller.py` | 微信窗口查找、恢复、导航、消息收发 |
| `llm_client.py` | DeepSeek API 封装 |
| `bot.py` | 主循环 |

### Step 5: 验证运行

## 技术栈

| 层 | 技术 |
|------|------|
| 窗口管理 | `uiautomation` + Win32 `ctypes` API |
| 键盘模拟 | `pyautogui`（操作时自动恢复窗口） |
| 剪贴板 | `pyperclip`（读写中文） |
| LLM | `openai` SDK（DeepSeek 兼容接口） |

## 架构

```
bot.py (主循环)
├── wechat_controller.py     # 微信窗口操作
│   ├── find_window()        #   窗口查找 + 标题监控
│   ├── restore_window()     #   恢复最小化窗口
│   ├── navigate_to(name)    #   Ctrl+F → 粘贴 → Enter
│   ├── copy_messages()      #   Ctrl+A → Ctrl+C → 读剪贴板
│   ├── send_message(text)   #   粘贴 → Enter
│   └── get_last_msg_hash()  #   最后一条消息 hash（去重）
│
└── llm_client.py            # DeepSeek API
    └── chat(message)        #   调用 deepseek-chat
```

## 消息检测流程

```
循环 (每 3s):
  1. Win32 GetWindowText 检查窗口标题是否有未读数变化
  2. 如果标题变化或距上次检查超过 10s:
     → restore_window() 恢复窗口（如果最小化）
     → 获取当前聊天最后一条消息
     → 与上次记录 hash 对比
     → 如果是新消息且发送者不是自己:
         → 提取消息文本
         → llm_client.chat(message)
         → send_message(reply)
```
