'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

declare global { interface Window { Telegram?: any } }

const WIZ_META: Record<number, { em:string, bg:string }> = {
  1:  { em:'🧙', bg:'linear-gradient(135deg,#1e3a8a,#3b82f6)' },
  2:  { em:'🧙', bg:'linear-gradient(135deg,#6d28d9,#a78bfa)' },
  3:  { em:'🪄', bg:'linear-gradient(135deg,#3730a3,#6366f1)' },
  4:  { em:'🔮', bg:'linear-gradient(135deg,#4c1d95,#7c3aed)' },
  5:  { em:'✨', bg:'linear-gradient(135deg,#0891b2,#22d3ee)' },
  6:  { em:'⚡', bg:'linear-gradient(135deg,#c2410c,#f97316)' },
  7:  { em:'💀', bg:'linear-gradient(135deg,#7f1d1d,#dc2626)' },
  8:  { em:'👑', bg:'linear-gradient(135deg,#a16207,#facc15)' },
  9:  { em:'🌟', bg:'linear-gradient(135deg,#0f766e,#14b8a6)' },
  10: { em:'🌙', bg:'linear-gradient(135deg,#be185d,#ec4899)' },
  11: { em:'🌀', bg:'linear-gradient(135deg,#9a3412,#ea580c)' },
  12: { em:'💎', bg:'linear-gradient(135deg,#475569,#cbd5e1)' },
};

const T:any = {
  ar: {
    nira:'نيرا', gas:'غاز', daily:'الدخل اليومي', collect:'اجمع', refresh:'تحديث',
    mine:'التعدين', shop:'الشخصيات', gasShop:'شراء غاز',
    deposit:'إيداع', withdraw:'سحب', partners:'إحالة', profile:'حسابي',
    perHour:'/ساعة', cost:'التكلفة', income:'الدخل اليومي',
    buy1:'شراء', buy10:'×10', history:'السجل', userID:'المعرّف',
    refLink:'رابط الإحالة', copy:'نسخ', refCount:'المدعوون', refEarn:'أرباح الإحالة',
    noTx:'لا توجد معاملات', open:'افتح من داخل Telegram', loading:'تحميل…',
    ok:'تم', submit:'إرسال', amount:'المبلغ', wallet:'العنوان', method:'العملة',
    depositNote:'أرسل المبلغ ثم أدخل بيانات العملية.',
    withdrawNote:'المعالجة خلال 24-48 ساعة.',
    noOwned:'لا تملك شخصيات بعد',
    buy:'شراء', out:'نفد الغاز',
  },
  en: {
    nira:'NIRA', gas:'Gas', daily:'Daily income', collect:'Collect', refresh:'Refresh',
    mine:'Mining', shop:'Wizards', gasShop:'Buy Gas',
    deposit:'Deposit', withdraw:'Withdraw', partners:'Partners', profile:'Profile',
    perHour:'/h', cost:'Cost', income:'Daily income',
    buy1:'Buy', buy10:'×10', history:'History', userID:'User ID',
    refLink:'Referral link', copy:'Copy', refCount:'Referrals', refEarn:'Ref earnings',
    noTx:'No transactions', open:'Open from Telegram', loading:'Loading…',
    ok:'Done', submit:'Submit', amount:'Amount', wallet:'Address', method:'Method',
    depositNote:'Send then submit tx details.',
    withdrawNote:'Processed within 24-48h.',
    noOwned:'No wizards owned yet',
    buy:'Buy', out:'Out of gas',
  },
};

const GAS_PKG = [
  { i:1, nira:100,  gas:500 },
  { i:2, nira:1000, gas:5000 },
  { i:3, nira:5000, gas:25000 },
];
const DEP = ['TRX','BNB','DOGE','LTC','SOL','USDT_BEP20','USDT_POLYGON','USDT_SOL'];
const WD  = ['USDT_BEP20','USDT_TRC20','BNB','TRX'];

function fmt(n:any, d=2){ const v=Number(n); if(!isFinite(v)) return '0';
  return v.toLocaleString(undefined,{maximumFractionDigits:d}); }

export default function Home(){
  const [initData, setInitData] = useState('');
  const [lang, setLang] = useState<'ar'|'en'>('ar');
  const [tab, setTab] = useState<'mine'|'deposit'|'withdraw'|'partners'|'profile'>('mine');
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(Date.now());
  const t = T[lang];

  useEffect(()=>{
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    if (tg) { try{ tg.ready(); tg.expand(); }catch{} setInitData(tg.initData ?? ''); }
    const i = setInterval(()=>setNow(Date.now()), 1000);
    return ()=>clearInterval(i);
  },[]);

  useEffect(()=>{ document.documentElement.lang = lang;
    document.documentElement.dir = lang==='ar'?'rtl':'ltr'; },[lang]);

  const show = (m:string)=>{ setToast(m); setTimeout(()=>setToast(''),2200); };

  const call = useCallback(async (payload:any)=>{
    if(!initData) throw new Error(t.open);
    const r = await fetch('/api/action',{ method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ initData, ...payload })});
    const j = await r.json();
    if(!r.ok) throw new Error(j.error || 'error');
    return j;
  },[initData,t.open]);

  const refresh = useCallback(async ()=>{
    if(!initData) return;
    try{ setState(await call({action:'state'})); }catch(e:any){ show(e.message); }
  },[call,initData]);

  useEffect(()=>{ refresh(); },[refresh]);

  const preview = useMemo(()=>{
    if(!state) return { earned:0, rate:0 };
    const rate = Number(state.daily_rate)/86400;
    const last = new Date(state.user.last_settled_at).getTime();
    const el = Math.max(0,(now-last)/1000);
    const earned = Math.min(Number(state.user.gas_balance), el*rate);
    return { earned, rate };
  },[state,now]);

  const action = async (p:any, okMsg:string)=>{
    setBusy(true);
    try{ await call(p); await refresh(); show(okMsg); }
    catch(e:any){ show(e.message); } finally{ setBusy(false); }
  };

  if(!state) return (
    <div className="container">
      <div className="top">
        <div className="balbox"><span className="flame" /><span className="v">—</span></div>
        <button className="iconbtn" onClick={()=>setLang(lang==='ar'?'en':'ar')}>
          {lang==='ar'?'EN':'ع'}</button>
      </div>
      <div className="muted">{initData? t.loading : t.open}</div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
  
  const niraShow = Number(state.user.nira_balance);
  const gasShow  = Number(state.user.gas_balance);
  const gasTotal = Number(state.user.gas_balance);
  const meterPct = gasTotal <= 0 ? 0 : Math.min(100, (preview.earned/gasTotal)*100);
  const owned = new Map<number,number>(state.wizards.map((w:any)=>[w.wizard_id,w.quantity]));
  const ownedWizards = state.catalog.filter((c:any)=>(owned.get(c.wizard_id) ?? 0) > 0);

  const NAV = [
    { k:'mine',     label:t.mine },
    { k:'deposit',  label:t.deposit },
    { k:'withdraw', label:t.withdraw },
    { k:'partners', label:t.partners },
  ];

  return (
  <div className="container">
    <div className="top">
      <div className="balbox">
        <span className="flame" />
        <span className="v count">{fmt(niraShow)}</span>
      </div>
      <button className="iconbtn" onClick={()=>setLang(lang==='ar'?'en':'ar')}>
        {lang==='ar'?'EN':'ع'}</button>
      <button className="iconbtn" onClick={()=>setTab('profile')}>{t.profile}</button>
    </div>

    <div className="nav">
      {NAV.map(x=>(
        <button key={x.k} className={tab===x.k?'active':''} onClick={()=>setTab(x.k as any)}>
          {x.label}
        </button>
      ))}
    </div>

    {tab==='mine' && (
      <>
        <div className="barwrap">
          <div className="barhead">
            <span>{t.daily}</span>
            <span className="num">{fmt(state.daily_rate,0)} {t.nira}</span>
          </div>
          <div className="bar orange"><div style={{width: meterPct+'%'}} /></div>
        </div>

        <div className="mid">
          <div className="hero">
            <div className="art">{ownedWizards[0] ? WIZ_META[ownedWizards[0].wizard_id]?.em : '🧙'}</div>
            <div className="acc count">{fmt(preview.earned,4)}</div>
            <button className="collect" disabled={busy || preview.earned<=0}
              onClick={()=>action({action:'settle'}, t.ok)}>
              {t.collect}
            </button>
          </div>

          <div className="owned">
            {ownedWizards.length === 0 ? (
              <div className="empty">{t.noOwned}</div>
            ) : ownedWizards.map((c:any)=>(
              <div className="cell" key={c.wizard_id}>
                <div className="em" style={{background:WIZ_META[c.wizard_id]?.bg,
                  borderRadius:8, width:32, height:32, display:'flex',
                  alignItems:'center', justifyContent:'center'}}>
                  {WIZ_META[c.wizard_id]?.em}
                </div>
                <div className="q">×{owned.get(c.wizard_id)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="barwrap gaswrap">
          <div className="barhead">
            <span>{t.gas}</span>
            <span className="num">{fmt(gasShow,0)}</span>
          </div>
          <div className="bar purple"><div style={{width: (100-meterPct)+'%'}} /></div>
        </div>

        <div className="gasrow">
          {GAS_PKG.map(p=>{
            const can = Number(state.user.nira_balance) >= p.nira;
            return (
              <button key={p.i} className={'gascard'+(can?'':' disabled')}
                disabled={busy || !can}
                onClick={()=>action({action:'buy_gas', package_index:p.i}, t.ok)}>
                <span className="orb" />
                <span className="pg">+{fmt(p.gas,0)}</span>
                <span className="pr"><span className="flame" />{fmt(p.nira,0)}</span>
              </button>
            );
          })}
        </div>

        <div className="catrow">
          {state.catalog.map((c:any)=>(
            <WizardCard key={c.wizard_id} c={c} owned={owned.get(c.wizard_id) ?? 0}
              nira={Number(state.user.nira_balance)} busy={busy}
              t={t} onBuy={(qty:number)=>action({action:'buy_wizard', wizard_id:c.wizard_id, quantity:qty}, t.ok)} />
          ))}
        </div>
      </>
    )}

    {tab==='deposit' && <DepositForm call={call} refresh={refresh} t={t} show={show} busy={busy} setBusy={setBusy} />}
    {tab==='withdraw' && <WithdrawForm call={call} refresh={refresh} t={t} show={show} busy={busy} setBusy={setBusy} nira={Number(state.user.nira_balance)} />}
    {tab==='partners' && <PartnersBlock state={state} t={t} show={show} />}
    {tab==='profile' && <ProfileBlock state={state} t={t} />}

    {toast && <div className="toast">{toast}</div>}
  </div>
  );
                           }

function WizardCard({c, owned, nira, busy, t, onBuy}:any){
  const meta = WIZ_META[c.wizard_id] || { em:'🧙', bg:'#1f2748' };
  const ratePct = Math.round(Number(c.daily_rate)*100);
  const can1 = nira >= Number(c.nira_cost);
  const can10 = nira >= Number(c.nira_cost)*10;
  return (
    <div className="wcard">
      <div className="top2">
        <div className="em2" style={{background:meta.bg}}>{meta.em}</div>
        <div style={{textAlign:'end'}}>
          <div className="rt">{ratePct}%</div>
          {owned > 0 && <div className="own">×{owned}</div>}
        </div>
      </div>
      <div className="nm">{c.name}</div>
      <div className="cost">
        <span><span className="flame" />{fmt(c.nira_cost,0)}</span>
        <span>+{fmt(c.daily_income,0)}</span>
      </div>
      <div className="buy">
        <button className="b1" disabled={busy || !can1} onClick={()=>onBuy(1)}>{t.buy1}</button>
        <button className="b2" disabled={busy || !can10} onClick={()=>onBuy(10)}>{t.buy10}</button>
      </div>
    </div>
  );
}

function DepositForm({call,refresh,t,show,busy,setBusy}:any){
  const [method,setMethod]=useState('TRX');
  const [usd,setUsd]=useState('');
  const [tx,setTx]=useState('');
  return (
    <div className="card">
      <div className="title">{t.deposit}</div>
      <div className="muted" style={{marginBottom:10}}>{t.depositNote}</div>
      <div className="field">
        <label>{t.method}</label>
        <select value={method} onChange={(e)=>setMethod(e.target.value)}>
          {DEP.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="field">
        <label>USD</label>
        <input placeholder="0.00" value={usd} onChange={e=>setUsd(e.target.value)} inputMode="decimal" />
      </div>
      <div className="field">
        <label>TX Hash</label>
        <input placeholder="—" value={tx} onChange={e=>setTx(e.target.value)} />
      </div>
      <button className="btnblue" disabled={busy || !usd || Number(usd)<=0}
        onClick={async()=>{
          setBusy(true);
          try{ await call({action:'deposit_request', method, amount_usd:Number(usd),
            amount_nira:Number(usd)*5000, tx_hash:tx}); await refresh(); show(t.ok);
            setUsd(''); setTx(''); }
          catch(e:any){ show(e.message); } finally{ setBusy(false); }
        }}>{t.submit}</button>
    </div>
  );
}

function WithdrawForm({call,refresh,t,show,busy,setBusy,nira}:any){
  const [method,setMethod]=useState('USDT_BEP20');
  const [amt,setAmt]=useState('');
  const [w,setW]=useState('');
  return (
    <div className="card">
      <div className="title">{t.withdraw}</div>
      <div className="muted" style={{marginBottom:10}}>{t.withdrawNote}</div>
      <div className="field">
        <label>{t.method}</label>
        <select value={method} onChange={(e)=>setMethod(e.target.value)}>
          {WD.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="field">
        <label>{t.amount}</label>
        <input placeholder="0" value={amt} onChange={e=>setAmt(e.target.value)} inputMode="decimal" />
      </div>
      <div className="field">
        <label>{t.wallet}</label>
        <input placeholder="—" value={w} onChange={e=>setW(e.target.value)} />
      </div>
      <button className="btnblue" disabled={busy || !amt || Number(amt)<=0 || Number(amt)>nira || !w}
        onClick={async()=>{
          setBusy(true);
          try{ await call({action:'withdraw_request', method, amount_nira:Number(amt),
            wallet_address:w}); await refresh(); show(t.ok); setAmt(''); setW(''); }
          catch(e:any){ show(e.message); } finally{ setBusy(false); }
        }}>{t.submit}</button>
    </div>
  );
}

function PartnersBlock({state,t,show}:any){
  const code = state.user.referral_code || '';
  const url  = `https://t.me/?startapp=${code}`;
  const earned = state.referrals.reduce((s:number,r:any)=>s+Number(r.total_nira_earned||0),0);
  return (
    <div className="card">
      <div className="title">{t.partners}</div>
      <div className="field">
        <label>{t.refLink}</label>
        <input readOnly value={url} style={{fontSize:11}} />
      </div>
      <button className="btnblue" style={{marginBottom:10}}
        onClick={()=>{ try{ navigator.clipboard.writeText(url); show(t.ok); }catch{} }}>
        {t.copy}
      </button>
      <div className="muted">{t.refCount}: {state.referrals.length}</div>
      <div className="muted">{t.refEarn}: {fmt(earned)} {t.nira}</div>
    </div>
  );
}

function ProfileBlock({state,t}:any){
  return (
    <div className="card">
      <div className="title">{t.profile}</div>
      <div className="muted">{t.userID}: #{state.user.user_id}</div>
      <div className="muted">@{state.user.username ?? '—'}</div>
      <div className="muted" style={{marginTop:8}}>{t.nira}: {fmt(state.user.nira_balance)}</div>
      <div className="muted">{t.gas}: {fmt(state.user.gas_balance)}</div>
    </div>
  );
}
