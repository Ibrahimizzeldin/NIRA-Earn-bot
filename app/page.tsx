'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

declare global { interface Window { Telegram?: any } }

const T = {
  ar: {
    nira:'نيرا', gas:'غاز', daily:'الدخل اليومي', balance:'رصيدك',
    collect:'اجمع', settle:'تسوية', refresh:'تحديث',
    mine:'التعدين', shop:'الشخصيات', gasShop:'شراء غاز',
    deposit:'إيداع', withdraw:'سحب', partners:'الإحالة', profile:'حسابي',
    rate:'المعدل اليومي', perHour:'في الساعة', noGas:'نفد الغاز',
    buyGas:'شراء غاز', owned:'مملوكة', cost:'التكلفة', income:'الدخل',
    buy1:'شراء ×1', buy10:'×10', history:'السجل',
    userID:'معرّف المستخدم', refLink:'رابط الإحالة', copy:'نسخ',
    refCount:'عدد المدعوين', refEarn:'أرباح الإحالة',
    noTx:'لا توجد معاملات بعد', openTelegram:'افتح من داخل Telegram',
    loading:'جاري التحميل…', ok:'تم', welcome:'مرحبًا',
    method:'الطريقة', amount:'المبلغ', wallet:'العنوان', submit:'إرسال',
    depositNote:'أرسل المبلغ إلى العنوان المحدد ثم أرسل بيانات العملية.',
    withdrawNote:'سيُعالج السحب خلال 24-48 ساعة.',
  },
  en: {
    nira:'NIRA', gas:'Gas', daily:'Daily income', balance:'Your balance',
    collect:'Collect', settle:'Settle', refresh:'Refresh',
    mine:'Mining', shop:'Wizards', gasShop:'Buy Gas',
    deposit:'Deposit', withdraw:'Withdraw', partners:'Partners', profile:'Profile',
    rate:'Daily rate', perHour:'per hour', noGas:'Out of gas',
    buyGas:'Buy Gas', owned:'owned', cost:'Cost', income:'Income',
    buy1:'Buy ×1', buy10:'×10', history:'History',
    userID:'User ID', refLink:'Referral link', copy:'Copy',
    refCount:'Referrals', refEarn:'Referral earnings',
    noTx:'No transactions yet', openTelegram:'Open from Telegram',
    loading:'Loading…', ok:'Done', welcome:'Welcome',
    method:'Method', amount:'Amount', wallet:'Address', submit:'Submit',
    depositNote:'Send the amount to the address, then submit your tx details.',
    withdrawNote:'Withdrawals are processed within 24-48 hours.',
  },
};

const GAS_PKG = [
  { i:1, nira:100,  gas:500 },
  { i:2, nira:1000, gas:5000 },
  { i:3, nira:5000, gas:25000 },
];

const DEPOSIT_METHODS = [
  { id:'TRX',   name:'TRX' },
  { id:'BNB',   name:'BNB (BEP20)' },
  { id:'DOGE',  name:'DOGE' },
  { id:'LTC',   name:'LTC' },
  { id:'SOL',   name:'SOL' },
  { id:'USDT_BEP20', name:'USDT (BEP20)' },
  { id:'USDT_POLYGON', name:'USDT (Polygon)' },
  { id:'USDT_SOL', name:'USDT (Solana)' },
];

const WD_METHODS = ['USDT_BEP20','USDT_TRC20','BNB','TRX'];

function fmt(n:any, d=4){ const v=Number(n); if(!isFinite(v)) return '0';
  return v.toLocaleString(undefined,{maximumFractionDigits:d}); }

export default function Home(){
  const [initData, setInitData] = useState('');
  const [lang, setLang] = useState<'ar'|'en'>('ar');
  const [tab, setTab] = useState('mine');
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

  const show = (m:string)=>{ setToast(m); setTimeout(()=>setToast(''),2600); };

  const call = useCallback(async (payload:any)=>{
    if(!initData) throw new Error(t.openTelegram);
    const r = await fetch('/api/action',{ method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ initData, ...payload })});
    const j = await r.json();
    if(!r.ok) throw new Error(j.error || 'error');
    return j;
  },[initData,t.openTelegram]);

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

  if(!state) return (<div className="container">
    <div className="topbar"><h1>NIRA Earn</h1>
      <button className="lang-btn" onClick={()=>setLang(lang==='ar'?'en':'ar')}>
        {lang==='ar'?'EN':'ع'}</button></div>
    <div className="muted">{initData? t.loading : t.openTelegram}</div>
    {toast && <div className="toast">{toast}</div>}
  </div>);

  const niraShow = Number(state.user.nira_balance) + preview.earned;
  const gasShow  = Math.max(0, Number(state.user.gas_balance) - preview.earned);
  const owned = new Map<number,number>(state.wizards.map((w:any)=>[w.wizard_id,w.quantity]));
  const meterPct = Math.min(100, Number(state.user.gas_balance) <= 0 ? 0 :
    (preview.earned / Number(state.user.gas_balance)) * 100);

  const TABS = [
    { k:'mine', label:t.mine },
    { k:'shop', label:t.shop },
    { k:'gasShop', label:t.gasShop },
    { k:'deposit', label:t.deposit },
    { k:'withdraw', label:t.withdraw },
    { k:'partners', label:t.partners },
    { k:'profile', label:t.profile },
  ];

  return (
  <div className="container">
    <div className="topbar">
      <h1>NIRA Earn <span className="pill">#{state.user.user_id}</span></h1>
      <button className="lang-btn" onClick={()=>setLang(lang==='ar'?'en':'ar')}>
        {lang==='ar'?'EN':'ع'}</button>
    </div>

    <div className="balances">
      <div className="card">
        <div className="label">{t.nira}</div>
        <div className="val count">{fmt(niraShow)}</div>
      </div>
      <div className="card">
        <div className="label">{t.gas}</div>
        <div className="val count">{fmt(gasShow)}</div>
        <div className="meter"><div style={{width: meterPct+'%'}} /></div>
      </div>
    </div>

    <div className="tabs">
      {TABS.map(x=>(
        <button key={x.k} className={tab===x.k?'active':''} onClick={()=>setTab(x.k)}>{x.label}</button>
      ))}
    </div>

    {tab==='mine' && (
      <>
        <div className="card">
          <div className="label">{t.daily}</div>
          <div className="val count">{fmt(state.daily_rate)} {t.nira}</div>
          <div className="muted">≈ {fmt(preview.rate*3600,6)} {t.perHour}</div>
          <div style={{marginTop:10}}>
            <div className="label">{t.collect} +{fmt(preview.earned)} {t.nira}</div>
          </div>
        </div>
        <div style={{marginTop:10}}>
          <button className="btn-collect" disabled={busy || preview.earned<=0}
            onClick={()=>action({action:'settle'}, t.ok)}>
            {t.collect}
          </button>
        </div>
        <div style={{marginTop:10, display:'flex', gap:8}}>
          <button className="btn2" disabled={busy} onClick={refresh}>{t.refresh}</button>
        </div>
        <Section title={t.history}>
          <div className="card" style={{padding:6}}>
            {state.transactions.length===0 ? <div className="tx muted">{t.noTx}</div> :
              state.transactions.slice(0,15).map((x:any)=>(
              <div className="tx" key={x.id}>
                <div><div style={{fontWeight:600}}>{x.type}</div>
                  <div className="muted">{new Date(x.created_at).toLocaleString()}</div></div>
                <div style={{textAlign:'end'}}>
                  {Number(x.amount_nira)!==0 && <div className={Number(x.amount_nira)>=0?'pos':'neg'}>
                    {Number(x.amount_nira)>0?'+':''}{fmt(x.amount_nira)} {t.nira}</div>}
                  {Number(x.amount_gas)!==0 && <div className={Number(x.amount_gas)>=0?'pos':'neg'}>
                    {Number(x.amount_gas)>0?'+':''}{fmt(x.amount_gas)} {t.gas}</div>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </>
    )}

    {tab==='shop' && (
      <Section title={t.shop}>
        <div className="grid">
          {state.catalog.map((c:any)=>{
            const q = owned.get(c.wizard_id) ?? 0;
            const canBuy = Number(state.user.gas_balance) >= Number(c.gas_cost);
            return (
              <div className="card" key={c.wizard_id}>
                <div style={{fontWeight:700}}>{c.name} {q? <span className="pill">×{q}</span> : null}</div>
                <div className="muted">{t.cost}: {fmt(c.gas_cost)} {t.gas}</div>
                <div className="muted">{t.income}: {fmt(c.daily_income)} {t.nira}</div>
                <div style={{display:'flex', gap:6, marginTop:8}}>
                  <button disabled={busy || !canBuy}
                    onClick={()=>action({action:'buy_wizard', wizard_id:c.wizard_id, quantity:1}, t.ok)}>
                    {t.buy1}</button>
                  <button className="btn2" disabled={busy || Number(state.user.gas_balance) < Number(c.gas_cost)*10}
                    onClick={()=>action({action:'buy_wizard', wizard_id:c.wizard_id, quantity:10}, t.ok)}>
                    {t.buy10}</button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    )}

    {tab==='gasShop' && (
      <Section title={t.gasShop}>
        <div className="grid">
          {GAS_PKG.map(p=>(
            <button key={p.i} disabled={busy || Number(state.user.nira_balance) < p.nira}
              onClick={()=>action({action:'buy_gas', package_index:p.i}, t.ok)}>
              {p.nira} {t.nira} ← {p.gas} {t.gas}
            </button>
          ))}
        </div>
      </Section>
    )}

    {tab==='deposit' && <DepositForm call={call} refresh={refresh} t={t} show={show} busy={busy} setBusy={setBusy} />}

    {tab==='withdraw' && <WithdrawForm call={call} refresh={refresh} t={t} show={show} busy={busy} setBusy={setBusy} nira={Number(state.user.nira_balance)} />}

    {tab==='partners' && (
      <Section title={t.partners}>
        <div className="card">
          <div className="label">{t.refLink}</div>
          <div style={{display:'flex',gap:6,marginTop:6}}>
            <input readOnly value={state.user.referral_code ? `https://t.me/${window?.Telegram?.WebApp?.initDataUnsafe?.user?.id?'':'YOURBOT'}?startapp=${state.user.referral_code}` : ''} />
            <button className="btn2" onClick={()=>{
              const code = state.user.referral_code;
              const url = `https://t.me/?startapp=${code}`;
              try{ navigator.clipboard.writeText(url); show(t.ok); }catch{}
            }}>{t.copy}</button>
          </div>
          <div className="muted" style={{marginTop:8}}>{t.refCount}: {state.referrals.length}</div>
          <div className="muted">{t.refEarn}: {fmt(state.referrals.reduce((s:number,r:any)=>s+Number(r.total_nira_earned||0),0))} {t.nira}</div>
        </div>
      </Section>
    )}

    {tab==='profile' && (
      <Section title={t.profile}>
        <div className="card">
          <div className="muted">{t.userID}: #{state.user.user_id}</div>
          <div className="muted" style={{marginTop:6}}>@{state.user.username ?? '—'}</div>
          <div className="muted" style={{marginTop:6}}>{t.nira}: {fmt(state.user.nira_balance)}</div>
          <div className="muted">{t.gas}: {fmt(state.user.gas_balance)}</div>
        </div>
      </Section>
    )}

    {toast && <div className="toast">{toast}</div>}
  </div>
  );
}

function Section({title, children}:{title:string, children:any}){
  return <div className="section"><h2>{title}</h2>{children}</div>;
}

function DepositForm({call,refresh,t,show,busy,setBusy}:any){
  const [method,setMethod]=useState('TRX');
  const [usd,setUsd]=useState('');
  const [tx,setTx]=useState('');
  return (
    <Section title={t.deposit}>
      <div className="card">
        <div className="muted">{t.depositNote}</div>
        <select value={method} onChange={(e)=>setMethod(e.target.value)} style={{marginTop:8}}>
          {DEPOSIT_METHODS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="input-row">
          <input placeholder="USD" value={usd} onChange={e=>setUsd(e.target.value)} inputMode="decimal" />
          <input placeholder="TX Hash" value={tx} onChange={e=>setTx(e.target.value)} />
        </div>
        <button disabled={busy || !usd || Number(usd)<=0}
          onClick={async()=>{
            setBusy(true);
            try{ await call({action:'deposit_request', method, amount_usd:Number(usd),
              amount_nira:Number(usd)*5000, tx_hash:tx}); await refresh(); show(t.ok);
              setUsd(''); setTx(''); }
            catch(e:any){ show(e.message); } finally{ setBusy(false); }
          }}>{t.submit}</button>
      </div>
    </Section>
  );
}

function WithdrawForm({call,refresh,t,show,busy,setBusy,nira}:any){
  const [method,setMethod]=useState('USDT_BEP20');
  const [amt,setAmt]=useState('');
  const [w,setW]=useState('');
  return (
    <Section title={t.withdraw}>
      <div className="card">
        <div className="muted">{t.withdrawNote}</div>
        <select value={method} onChange={(e)=>setMethod(e.target.value)} style={{marginTop:8}}>
          {WD_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <input placeholder={t.amount} value={amt} onChange={e=>setAmt(e.target.value)} inputMode="decimal" />
        <input placeholder={t.wallet} value={w} onChange={e=>setW(e.target.value)} />
        <button disabled={busy || !amt || Number(amt)<=0 || Number(amt)>nira || !w}
          onClick={async()=>{
            setBusy(true);
            try{ await call({action:'withdraw_request', method, amount_nira:Number(amt),
              wallet_address:w}); await refresh(); show(t.ok); setAmt(''); setW(''); }
            catch(e:any){ show(e.message); } finally{ setBusy(false); }
          }}>{t.submit}</button>
      </div>
    </Section>
  );
    }
