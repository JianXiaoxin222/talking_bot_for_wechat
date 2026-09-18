import { db } from '../storage/db.js'
import { config } from '../config.js'

export type AccessDecision = 'block' | 'admin' | 'allow' | 'deny'

export function decideAccess(input: { userStatus?: string; roomStatus?: string; isAdmin: boolean }): AccessDecision {
  if (input.userStatus === 'block' || input.roomStatus === 'block') return 'block'
  if (input.isAdmin) return 'admin'
  if (input.userStatus === 'allow' || input.roomStatus === 'allow') return 'allow'
  return 'deny'
}

export function parseCommand(command: string): { action: string; target?: string } {
  const [action, target] = command.trim().split(/\s+/, 3)
  return { action: action ?? '', target }
}

export class AccessService {
  isAdmin(contactId: string): boolean { return config.admins.has(contactId) }

  async canChat(contactId: string, roomId?: string): Promise<boolean> {
    const user = await db.query('SELECT status FROM access_users WHERE contact_id=$1', [contactId])
    const room = roomId ? await db.query('SELECT status FROM access_rooms WHERE room_id=$1', [roomId]) : { rows: [] as any[] }
    const decision = decideAccess({ userStatus: user.rows[0]?.status, roomStatus: room.rows[0]?.status, isAdmin: this.isAdmin(contactId) })
    return decision === 'admin' || decision === 'allow'
  }

  async execute(adminId: string, command: string): Promise<string> {
    if (!this.isAdmin(adminId)) return '无权限。'
    const { action, target } = parseCommand(command)
    if (action === 'users') {
      const rows = await db.query('SELECT contact_id,status,note FROM access_users ORDER BY contact_id')
      return rows.rows.length ? rows.rows.map(r => `${r.contact_id}: ${r.status}${r.note ? ` (${r.note})` : ''}`).join('\n') : '暂无用户配置。'
    }
    if (action === 'status') return 'Bot 正常运行。'
    if (action === 'allow' || action === 'deny' || action === 'block' || action === 'unblock') {
      if (!target) return '用法：!bot allow|deny|block|unblock <contactId>'
      const status = action === 'unblock' ? 'deny' : action
      await db.query(`INSERT INTO access_users(contact_id,status) VALUES($1,$2) ON CONFLICT(contact_id) DO UPDATE SET status=$2,updated_at=now()`, [target, status])
      await db.query('INSERT INTO access_audit_logs(admin_id,action,target_id) VALUES($1,$2,$3)', [adminId, action, target])
      return `${target} 已设置为 ${status}。`
    }
    return '未知指令。支持：allow、deny、block、unblock、users、kb reload、status。'
  }
}
