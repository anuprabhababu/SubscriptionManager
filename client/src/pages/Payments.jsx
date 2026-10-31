import {useEffect,useState} from 'react';
import {CreditCard,RefreshCw} from 'lucide-react';
import {api} from '../services/api';
import Button from '../components/common/Button';
import DataTable from '../components/common/DataTable';

const money=n=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(n)||0);
const date=d=>d?new Date(d).toLocaleDateString():'—';

export default function Payments(){const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');async function load(){setLoading(true);try{setRows(await api('/payments'));setError('');}catch(e){setError(e.message);}finally{setLoading(false);}}useEffect(()=>{load();},[]);return <><div className="welcome-row"><div><div className="eyebrow">BILLING</div><h1>Payments</h1><p>Recorded payments and invoice references.</p></div><Button variant="secondary" onClick={load}><RefreshCw size={15}/> Refresh</Button></div><section className="panel list-panel"><div className="list-toolbar"><div className="list-title"><span className="quick-icon green"><CreditCard size={17}/></span><strong>Payment history</strong><span className="count-pill">{rows.length}</span></div></div><DataTable columns={[{key:'invoice',label:'Invoice',render:(_,r)=>r.invoice?.invoiceNumber},{key:'customer',label:'Customer',render:(_,r)=>r.invoice?.subscription?.customer?.companyName},{key:'paidAt',label:'Date',render:(_,r)=>date(r.paidAt)},{key:'method',label:'Method'},{key:'reference',label:'Reference'},{key:'amount',label:'Amount',render:(_,r)=>money(r.amount)}]} rows={rows} loading={loading} error={error} onRetry={load}/></section></>}
