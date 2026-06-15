"""DeepSeek LLM 客户端"""
import os

from openai import OpenAI


def get_client():
    """获取 DeepSeek API 客户端"""
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError(
            "请设置环境变量 DEEPSEEK_API_KEY。\n"
            "PowerShell: $env:DEEPSEEK_API_KEY='sk-xxx'\n"
            "CMD: set DEEPSEEK_API_KEY=sk-xxx"
        )
    return OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com",
    )


def chat(user_message: str, system_prompt: str = None) -> str:
    """向 DeepSeek 发送消息，返回回复文本

    Args:
        user_message: 用户消息内容
        system_prompt: 可选的 system prompt

    Returns:
        DeepSeek 的回复文本
    """
    client = get_client()

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=messages,
    )

    return response.choices[0].message.content
