import {useEffect,useState} from 'react';
import {Users,Layers,RefreshCw,ArrowUpRight,Plus,CalendarDays,Receipt,WalletCards,TriangleAlert,UserPlus} from 'lucide-react';
import {Link} from 'react-router-dom';
import StatCard from '../components/dashboard/StatCard';
import RevenueChart from '../components/dashboard/RevenueChart';
import {api} from '../services/api';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import {useAuth} from '../context/AuthContext';

const money=value=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(value)||0);
const emptyStaff={name:'',email:'',password:''};
const monthKey=date=>`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;

export default function Dashboard(){
 const{user}=useAuth();
 const[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const[trend,setTrend]=useState([]),[trendLoading,setTrendLoading]=useState(true),[trendError,setTrendError]=useState('');
 const[staffOpen,setStaffOpen]=useState(false),[staffForm,setStaffForm]=useState(emptyStaff),[staffError,setStaffError]=useState(''),[staffCreated,setStaffCreated]=useState(''),[staffSaving,setStaffSaving]=useState(false),[filters,setFilters]=useState({from:'',to:'',status:''});
 async function load(){setLoading(true);try{const query=new URLSearchParams(Object.entries(filters).filter(([,value])=>value));setData(await api(`/dashboard${query.size?`?${query}`:''}`));setError('');}catch(e){setError(e.message);}finally{setLoading(false);}}
 async function loadTrend(signal){setTrendLoading(true);setTrendError('');try{
  const today=new Date(),starts=Array.from({length:6},(_,index)=>new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-5+index,1))),totals=new Map(starts.map(date=>[monthKey(date),0]));
  const addPayment=payment=>{const key=monthKey(new Date(payment.paidAt));if(totals.has(key))totals.set(key,totals.get(key)+Number(payment.amount||0));};
  const recentPayments=await api('/payments',{signal});
  const oldestReturned=recentPayments.length?new Date(recentPayments[recentPayments.length-1].paidAt):null;
  const paymentsCoverWindow=recentPayments.length<500||(oldestReturned&&oldestReturned<starts[0]);
  if(paymentsCoverWindow){recentPayments.forEach(addPayment);}else{
   const pageSize=100;let total=0;
   const consume=result=>{for(const invoice of result.items||result)for(const payment of invoice.payments||[])addPayment(payment);};
   const first=await api(`/invoices?page=1&pageSize=${pageSize}`,{signal});consume(first);total=first.total??(first.items||first).length;
   const pageCount=Math.ceil(total/pageSize);
   for(let start=2;start<=pageCount;start+=4){const results=await Promise.all(Array.from({length:Math.min(4,pageCount-start+1)},(_,offset)=>api(`/invoices?page=${start+offset}&pageSize=${pageSize}`,{signal})));results.forEach(consume);}
  }
  if(signal?.aborted)return;
  setTrend(starts.map(date=>({key:monthKey(date),label:date.toLocaleDateString(undefined,{month:'short'}),amount:Math.round((totals.get(monthKey(date))||0)*100)/100})));
 }catch(e){if(!signal?.aborted)setTrendError(e.message||'Could not load payment history.');}finally{if(!signal?.aborted)setTrendLoading(false);}}
 useEffect(()=>{load();},[filters.from,filters.to,filters.status]);
 useEffect(()=>{const controller=new AbortController();loadTrend(controller.signal);return()=>controller.abort();},[]);
 const customer=user?.role==='CUSTOMER',isAdmin=user?.role==='ADMIN';
 const cards=customer?[
  ['Active subscriptions',data?.activeSubscriptions??'—','Your current plans',RefreshCw,'violet'],['Invoices',data?.invoices??'—','Your invoices',Receipt,'blue'],['Outstanding',money(data?.outstanding),'Unpaid balance',TriangleAlert,'amber'],['Payments received',money(data?.collected),'Payments recorded',WalletCards,'green'],
 ]:[
  ['MRR',money(data?.monthlyRecurringRevenue),'Active subscription run rate',RefreshCw,'violet',true],['ARR',money(data?.annualRecurringRevenue),'Annualized active run rate',Layers,'blue',true],['Active subscriptions',data?.activeSubscriptions??'—','Currently billing',Users,'green'],['Collected revenue',money(data?.collected),'Payments in selected dates',WalletCards,'green'],['Outstanding balance',money(data?.outstanding),'Selected invoice balances',Receipt,'amber'],['Overdue invoices',data?.overdueInvoices??'—','Require follow-up',TriangleAlert,'blue'],
 ];
 async function createStaff(event){event.preventDefault();setStaffError('');setStaffCreated('');setStaffSaving(true);try{const result=await api('/auth/staff',{method:'POST',body:JSON.stringify(staffForm)});setStaffCreated(`Staff account created for ${result.user.email}.`);setStaffForm(emptyStaff);}catch(e){setStaffError(e.message);}finally{setStaffSaving(false);}}
 function closeStaff(){setStaffOpen(false);setStaffError('');setStaffCreated('');setStaffForm(emptyStaff);}
 return <>
  <div className="welcome-row"><div><div className="eyebrow">{customer?'MY ACCOUNT':'YOUR WORKSPACE'}</div><h1>{customer?'Welcome back':'Overview'}</h1><p>Subscription and billing activity at a glance.</p></div><div className="welcome-actions"><span className="date-chip"><CalendarDays size={15}/> {new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span>{isAdmin&&<Button variant="secondary" onClick={()=>setStaffOpen(true)}><UserPlus size={16}/> Create Staff</Button>}{customer?<Link to="/portal"><Button><ArrowUpRight size={16}/> Open portal</Button></Link>:<Link to="/subscriptions"><Button><Plus size={16}/> New subscription</Button></Link>}</div></div>
  {!customer&&<section className="panel dashboard-filters"><label>Invoice date from<input type="date" value={filters.from} onChange={event=>setFilters({...filters,from:event.target.value})}/></label><label>To<input type="date" value={filters.to} onChange={event=>setFilters({...filters,to:event.target.value})}/></label><label>Status<select value={filters.status} onChange={event=>setFilters({...filters,status:event.target.value})}><option value="">All statuses</option>{['DRAFT','CONFIRMED','PARTIAL','PAID','OVERDUE','CANCELLED'].map(status=><option key={status}>{status}</option>)}</select></label><Button variant="secondary" onClick={()=>setFilters({from:'',to:'',status:''})}>Clear filters</Button></section>}
  {error&&<div className="inline-error">{error}<button onClick={load}>Retry</button></div>}{staffCreated&&<div className="staff-success" role="status">{staffCreated}</div>}
  <div className={`stat-grid dashboard-kpis ${customer?'portal-stats':''}`}>{cards.map(([label,value,caption,icon,tone,featured])=><StatCard key={label} {...{label,value:loading?'…':value,caption,icon,tone,featured}}/>)}</div>
  <div className="dashboard-grid"><section className="panel overview-panel"><div className="panel-head"><div><h2>{customer?'Your payment trend':'Collected revenue'}</h2><p>Payments recorded against invoices over the last six months</p></div><span className="period-chip">Last 6 months</span></div><RevenueChart points={trend} loading={trendLoading} error={trendError} onRetry={()=>loadTrend()}/></section>
   <section className="panel quick-panel"><div className="panel-head"><div><h2>Quick actions</h2><p>{customer?'Your account':'Keep billing moving'}</p></div></div><div className="quick-list">{customer?<><Link to="/subscriptions"><span className="quick-icon violet"><RefreshCw size={17}/></span><span><strong>My subscriptions</strong><small>Review active and past plans</small></span><ArrowUpRight size={16}/></Link><Link to="/invoices"><span className="quick-icon blue"><Receipt size={17}/></span><span><strong>My invoices</strong><small>Check balances and due dates</small></span><ArrowUpRight size={16}/></Link><Link to="/payments"><span className="quick-icon green"><WalletCards size={17}/></span><span><strong>Payment history</strong><small>Review recorded payments</small></span><ArrowUpRight size={16}/></Link></>:<><Link to="/subscriptions"><span className="quick-icon violet"><RefreshCw size={17}/></span><span><strong>Create a subscription</strong><small>Start recurring billing</small></span><ArrowUpRight size={16}/></Link><Link to="/invoices"><span className="quick-icon blue"><Receipt size={17}/></span><span><strong>Review invoices</strong><small>Track balances and due dates</small></span><ArrowUpRight size={16}/></Link><Link to="/customers"><span className="quick-icon amber"><Users size={17}/></span><span><strong>Manage customers</strong><small>{data?.customers??'—'} accounts</small></span><ArrowUpRight size={16}/></Link><Link to="/plans"><span className="quick-icon green"><Layers size={17}/></span><span><strong>Manage plans</strong><small>{data?.plans??'—'} plans</small></span><ArrowUpRight size={16}/></Link></>}</div></section>
  </div>
  {isAdmin&&<Modal open={staffOpen} onClose={closeStaff} title="Create staff account"><form className="staff-form" onSubmit={createStaff}><p>Create a staff login for someone on your team.</p><label>Name<input required minLength="2" maxLength="100" autoComplete="name" value={staffForm.name} onChange={event=>setStaffForm({...staffForm,name:event.target.value})}/></label><label>Email<input required type="email" maxLength="254" autoComplete="email" value={staffForm.email} onChange={event=>setStaffForm({...staffForm,email:event.target.value})}/></label><label>Password<input required type="password" minLength="9" autoComplete="new-password" value={staffForm.password} onChange={event=>setStaffForm({...staffForm,password:event.target.value})}/><small>At least 9 characters, with uppercase, lowercase, and a special character.</small></label>{staffError&&<div className="form-error" role="alert">{staffError}</div>}{staffCreated&&<div className="staff-success" role="status">{staffCreated}</div>}<div className="modal-actions"><Button type="button" variant="secondary" onClick={closeStaff}>Cancel</Button><Button disabled={staffSaving||Boolean(staffCreated)}>{staffSaving?'Creating…':'Create Staff'}</Button></div></form></Modal>}
 </>;
}
