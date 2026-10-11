import { NextRequest, NextResponse } from 'next/server';
import { verifyInitData } from '@/lib/telegram';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.initData) return NextResponse.json({ error: 'no_initData' }, { status: 400 });
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: 'server_misconfig' }, { status: 500 });

  const v = verifyInitData(body.initData, botToken);
  if (!v.ok || !v.user) return NextResponse.json({ error: 'invalid_initData', detail: v.error }, { status: 401 });

  const tg = v.user;
  const db = adminClient();
  const refCode = body.ref_code ?? null;

  const reg = await db.rpc('nira_register_user', {
    p_tid: tg.id, p_username: tg.username ?? null,
    p_first_name: tg.first_name ?? null, p_ref_code: refCode,
  });
  if (reg.error) return NextResponse.json({ error: 'register_failed', detail: reg.error.message }, { status: 500 });

  try {
    switch (body.action) {
      case 'state': {
        await db.rpc('nira_settle_mining', { p_tid: tg.id });
        const [user, wizards, catalog, tx, rate, refs] = await Promise.all([
          db.from('nira_users').select('user_id,telegram_id,username,first_name,nira_balance,gas_balance,last_settled_at,referral_code').eq('telegram_id', tg.id).single(),
          db.from('nira_user_wizards').select('wizard_id,quantity').eq('telegram_id', tg.id),
          db.from('nira_wizard_catalog').select('wizard_id,name,gas_cost,daily_income,daily_rate').order('wizard_id'),
          db.from('nira_transactions').select('id,type,amount_nira,amount_gas,meta,created_at').eq('telegram_id', tg.id).order('created_at', { ascending: false }).limit(30),
          db.rpc('nira_daily_rate', { p_tid: tg.id }),
          db.from('nira_referrals').select('referred_telegram_id,total_nira_earned').eq('referrer_telegram_id', tg.id),
        ]);
        return NextResponse.json({
          user: user.data, wizards: wizards.data ?? [], catalog: catalog.data ?? [],
          transactions: tx.data ?? [], daily_rate: rate.data ?? 0, referrals: refs.data ?? [],
        });
      }
      case 'buy_gas': {
        const r = await db.rpc('nira_buy_gas', { p_tid: tg.id, p_pkg: body.package_index });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 });
        return NextResponse.json({ ok: true, result: r.data });
      }
      case 'buy_wizard': {
        const r = await db.rpc('nira_buy_wizard', { p_tid: tg.id, p_wid: body.wizard_id, p_qty: body.quantity ?? 1 });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 });
        return NextResponse.json({ ok: true, result: r.data });
      }
      case 'settle': {
        const r = await db.rpc('nira_settle_mining', { p_tid: tg.id });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 });
        return NextResponse.json({ ok: true, result: r.data });
      }
      case 'deposit_request': {
        const { error } = await db.from('nira_deposits').insert({
          telegram_id: tg.id, method: body.method, amount_usd: body.amount_usd,
          amount_nira: body.amount_nira, tx_hash: body.tx_hash ?? null, status: 'pending',
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }
      case 'withdraw_request': {
        const { error } = await db.from('nira_withdrawals').insert({
          telegram_id: tg.id, method: body.method, amount_nira: body.amount_nira,
          wallet_address: body.wallet_address, status: 'pending',
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'server_error', detail: e?.message ?? 'unknown' }, { status: 500 });
  }
                                                }
