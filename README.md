# Wechaty 个人微信 RAG 聊天机器人

这是一个 TypeScript/Node.js 20 项目，使用 Wechaty 接入个人微信，使用 PostgreSQL + pgvector 保存知识库和会话，Redis 负责去重、限流、锁和 LLM 并发控制。PostgreSQL、Redis 和 Bot 都由 Docker Compose 管理，LLM/Embedding 使用外部 OpenAI 兼容接口。

## 快速启动

1. 复制 `.env.example` 为 `.env`，填写 `WECHATY_PUPPET_SERVICE_TOKEN`、LLM/Embedding 地址、模型和密钥，并设置 `ADMIN_CONTACT_IDS`。
2. 将知识内容写入 `knowledge/knowledge.txt`。
3. 启动：`docker compose up -d --build`。
4. 查看二维码和登录日志：`docker compose logs -f bot`，使用 Wechaty Puppet Service 支持的方式扫码登录。

默认情况下只有白名单用户、管理员或已允许的群聊会得到回复；群聊消息必须 @ 机器人。管理员可发送：

```text
!bot allow <contactId>
!bot deny <contactId>
!bot block <contactId>
!bot unblock <contactId>
!bot users
!bot kb reload
!bot status
```

知识库会按文件 SHA-256 增量导入，检索使用 pgvector cosine 相似度。机器人只把摘要、最近 12 条消息和最多 6000 字符的相关知识片段发送给 LLM；原始消息和摘要默认保留 30 天。

## 备份与安全

使用 `pg_dump` 或定期备份 `postgres_data` volume。Redis 仅保存短期状态，不是唯一事实来源。不要提交 `.env`、Puppet token 或 API key。个人微信自动化可能违反平台规则，请自行评估账号封禁和隐私风险。

## 本地验证

```text
npm install
npm run build
npm test
docker compose config
```

