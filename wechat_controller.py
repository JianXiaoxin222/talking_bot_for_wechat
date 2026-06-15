"""微信窗口控制器 — 基于 Win32 + UIA + pyautogui + 剪贴板"""
import ctypes
import hashlib
import time
import re

import pyautogui
import pyperclip
import uiautomation as auto

# Win32 constants
SW_RESTORE = 9
SW_SHOW = 5
HWND_TOPMOST = -1
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_SHOWWINDOW = 0x0040

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# ── safe type ──────────────────────────────────────────────
def _safe_str(val):
    """安全转换为字符串，处理可能的 ctypes 类型"""
    if val is None:
        return ""
    if hasattr(val, "value"):
        return _safe_str(val.value)
    if isinstance(val, str):
        return val
    return str(val)


# ── window helpers ─────────────────────────────────────────
def _find_wechat_window():
    """查找微信主窗口 (Qt51514QWindowIcon, Name=微信)，返回 UIA Control"""
    for w in auto.GetRootControl().GetChildren():
        cls = _safe_str(w.ClassName)
        name = _safe_str(w.Name)
        if "Qt51514QWindowIcon" in cls and "微信" in name:
            return w
    return None


def _get_hwnd(control):
    """从 UIA Control 获取原生 HWND"""
    try:
        return control.NativeWindowHandle
    except Exception:
        return 0


def _restore_and_focus(hwnd):
    """恢复窗口（如果最小化）并置于前台"""
    if hwnd:
        user32.ShowWindow(hwnd, SW_RESTORE)
        user32.ShowWindow(hwnd, SW_SHOW)
        # 尝试置顶再取消，确保窗口在前台
        user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
        user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE)  # 取消置顶
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.3)


def _get_window_title():
    """通过 Win32 API 获取微信窗口标题（用于未读计数检测）"""
    # 枚举所有窗口找微信
    found_title = ""

    def enum_proc(hwnd, _lparam):
        nonlocal found_title
        cls_buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls_buf, 256)
        if "Qt51514QWindowIcon" in cls_buf.value:
            title_len = user32.GetWindowTextLengthW(hwnd)
            if title_len > 0:
                title_buf = ctypes.create_unicode_buffer(title_len + 1)
                user32.GetWindowTextW(hwnd, title_buf, title_len + 1)
                if "微信" in title_buf.value:
                    found_title = title_buf.value
                    return False  # 停止枚举
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows(WNDENUMPROC(enum_proc), 0)
    return found_title


def _parse_unread_count(title):
    """从窗口标题解析未读消息数，例如 '微信(3)' → 3"""
    if not title:
        return 0
    m = re.search(r"\((\d+)\)", title)
    return int(m.group(1)) if m else 0


# ── core API ───────────────────────────────────────────────

def find_window():
    """返回微信窗口的 UIA Control 和 HWND，找不到返回 (None, 0)"""
    w = _find_wechat_window()
    if w is None:
        return None, 0
    return w, _get_hwnd(w)


def ensure_window_visible():
    """确保微信窗口可见且在前台"""
    w, hwnd = find_window()
    if w is None:
        raise RuntimeError("微信窗口未找到，请确认微信已登录且窗口打开")
    _restore_and_focus(hwnd)
    return w, hwnd


def get_unread_count():
    """获取当前未读消息数（通过窗口标题）"""
    title = _get_window_title()
    return _parse_unread_count(title)


def navigate_to_chat(name):
    """跳转到指定聊天（通过 Ctrl+F 搜索 + Enter）"""
    # Ctrl+F 打开搜索
    pyautogui.hotkey("ctrl", "f")
    time.sleep(0.3)

    # 清空搜索框并输入名称
    pyautogui.hotkey("ctrl", "a")
    time.sleep(0.1)
    pyperclip.copy(name)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.5)

    # 回车进入聊天
    pyautogui.press("enter")
    time.sleep(0.5)


def _click_chat_area():
    """点击聊天消息区域（用于让焦点离开输入框）"""
    # 微信窗口大小约 1521x901，聊天区域大约在中上部分
    # 我们点聊天区域中间偏上的位置
    w, _ = find_window()
    if w is None:
        return
    rect = w.BoundingRectangle
    # 聊天区域大约在窗口上部 15%-70%
    cx = rect.left + rect.width() // 2
    cy = rect.top + rect.height() // 3
    pyautogui.click(cx, cy)
    time.sleep(0.2)


def copy_chat_messages():
    """复制当前聊天窗口的全部可见消息，返回剪贴板文本"""
    # 先点击聊天区域确保焦点正确
    _click_chat_area()

    # 全选 + 复制
    pyautogui.hotkey("ctrl", "a")
    time.sleep(0.2)
    pyautogui.hotkey("ctrl", "c")
    time.sleep(0.3)

    return pyperclip.paste()


def get_last_message():
    """获取最后一条消息的 (发送者, 内容, hash)"""
    text = copy_chat_messages()
    lines = text.strip().split("\n")
    if not lines:
        return None, None, None

    # 微信复制格式通常是多行，最后一条消息在最后
    # 简单处理：取最后两行（发送者 + 内容）
    # 实际格式可能更复杂，这里做基础解析
    content = lines[-1].strip() if len(lines) >= 1 else ""
    sender = lines[-2].strip() if len(lines) >= 2 else ""

    # 如果"发送者"行看起来更像内容，则调整
    if sender and len(sender) > 50:  # 发送者昵称通常不会这么长
        content = sender
        sender = ""

    msg_hash = hashlib.sha256(f"{sender}:{content}".encode()).hexdigest()[:16]
    return sender, content, msg_hash


def send_message(text):
    """向当前聊天窗口发送消息"""
    pyperclip.copy(text)
    time.sleep(0.1)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.1)
    pyautogui.press("enter")
    time.sleep(0.3)


def is_my_message(sender, my_name="文件传输助手"):
    """判断消息是否是自己发的（用于过滤，避免循环回复）"""
    # 自己发的消息在微信里通常显示在右侧，复制时 sender 为空或为自己昵称
    # 简单启发式：如果 sender 不是目标名称，很可能是自己发的
    return not sender or sender == my_name or "自己" in sender
