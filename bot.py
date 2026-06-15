"""微信自动回复 Bot — 主循环"""
import time
import sys

from wechat_controller import (
    ensure_window_visible,
    navigate_to_chat,
    get_last_message,
    send_message,
    get_unread_count,
    is_my_message,
)
from llm_client import chat

# ── config ─────────────────────────────────────────────────
TARGET_CHAT = "文件传输助手"
POLL_INTERVAL = 3  # 基础轮询间隔（秒）
FORCE_CHECK_INTERVAL = 10  # 即使无未读提示，也强制检查的间隔（秒）
SYSTEM_PROMPT = "你是一个友好的助手。请简洁、准确地回答用户的问题。"

# ── main loop ───────────────────────────────────────────────

def main():
    print("=" * 50)
    print("🤖 微信自动回复 Bot 启动")
    print(f"   目标聊天: {TARGET_CHAT}")
    print(f"   轮询间隔: {POLL_INTERVAL}s")
    print("=" * 50)

    # 初始化：确保微信窗口可见，导航到目标聊天
    print("\n[初始化] 查找微信窗口...")
    try:
        ensure_window_visible()
    except RuntimeError as e:
        print(f"❌ {e}")
        sys.exit(1)

    print(f"[初始化] 导航到「{TARGET_CHAT}」...")
    navigate_to_chat(TARGET_CHAT)

    # 获取当前状态作为基线
    _, _, last_hash = get_last_message()
    last_unread = get_unread_count()
    last_force_check = time.time()

    print(f"[初始化] 当前未读数: {last_unread}")
    print(f"[初始化] 最后消息 hash: {last_hash}")
    print(f"\n✅ Bot 就绪，开始监听消息...\n")

    try:
        while True:
            current_unread = get_unread_count()
            now = time.time()
            should_check = False
            reason = ""

            # 触发条件 1: 未读数变化
            if current_unread != last_unread:
                should_check = True
                reason = f"未读数变化 ({last_unread} → {current_unread})"
                last_unread = current_unread

            # 触发条件 2: 距上次强制检查超过间隔
            if now - last_force_check >= FORCE_CHECK_INTERVAL:
                should_check = True
                reason = "定时强制检查"

            if should_check:
                print(f"[{time.strftime('%H:%M:%S')}] {reason}，获取消息...")

                # 确保窗口在操作前可见
                ensure_window_visible()

                sender, content, msg_hash = get_last_message()

                if msg_hash and msg_hash != last_hash:
                    print(f"  发送者: {sender}")
                    print(f"  内容: {content[:100]}{'...' if len(content) > 100 else ''}")

                    # 检查是否是自己发的消息
                    if is_my_message(sender):
                        print("  ⏭️  跳过（自己的消息）")
                    else:
                        # 调用 DeepSeek
                        try:
                            print("  🤔 调用 DeepSeek...")
                            reply = chat(content, system_prompt=SYSTEM_PROMPT)
                            print(f"  💬 回复: {reply[:100]}{'...' if len(reply) > 100 else ''}")
                            send_message(reply)
                            print("  ✅ 已发送")
                        except Exception as e:
                            print(f"  ❌ LLM 调用失败: {e}")

                    last_hash = msg_hash
                else:
                    print(f"  没有新消息 (hash={msg_hash}, last={last_hash})")

                last_force_check = now

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("\n\n⏹️  收到中断信号，Bot 已停止")
        sys.exit(0)


if __name__ == "__main__":
    main()
