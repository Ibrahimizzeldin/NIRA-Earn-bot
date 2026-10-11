import crypto from 'crypto';

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export function verifyInitData(initData: string, botToken: string) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { ok: false, error: 'no_hash' as const };
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (computed !== hash) return { ok: false, error: 'bad_hash' as const };
    const userStr = params.get('user');
    if (!userStr) return { ok: false, error: 'no_user' as const };
    const user = JSON.parse(userStr) as TelegramUser;
    if (!user || typeof user.id !== 'number') return { ok: false, error: 'bad_user' as const };
    return { ok: true, user };
  } catch (e: any) {
    return { ok: false, error: (e?.message ?? 'verify_failed') as string };
  }
                                   }
