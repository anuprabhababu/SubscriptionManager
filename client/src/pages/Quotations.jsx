import {useEffect,useMemo,useState} from 'react';
import {ArrowRight,Check,Eye,FileText,Plus,RefreshCw,Send,ThumbsDown,Pencil,FilePlus2} from 'lucide-react';
import {api} from '../services/api';
import {useAuth} from '../context/AuthContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import QuoteLinesEditor from '../components/quotations/QuoteLinesEditor';

const today=()=>new Date().toISOString().slice(0,10);
const date=value=>value?new Date(value).toLocaleDateString():'—';
const money=value=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(value)||0);
const emptyForm=()=>({customerId:'',planId:'',planQuantity:1,planUnitPrice:'',lines:[],startDate:today(),expiryDate:'',validUntil:'',paymentTerms:'Net 14 days',taxRate:0});
const statusNames={DRAFT:'Draft',QUOTATION:'Quotation',CONFIRMED:'Confirmed',REJECTED:'Rejected',EXPIRED:'Expired'};

export default function Quotations(){
  const {user}=useAuth();
  const canManage=['ADMIN','STAFF'].includes(user?.role);
  const [rows,setRows]=useState([]),[customers,setCustomers]=useState([]),[plans,setPlans]=useState([]),[products,setProducts]=useState([]),[templates,setTemplates]=useState([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[open,setOpen]=useState(false),[saving,setSaving]=useState(false),[editing,setEditing]=useState(null),[viewing,setViewing]=useState(null),[form,setForm]=useState(emptyForm()),[templateChoice,setTemplateChoice]=useState(''),[notice,setNotice]=useState('');

  async function load(){setLoading(true);try{setRows(await api('/quotations'));setError('');}catch(e){setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(!canManage)return;Promise.all([api('/customers'),api('/plans'),api('/products'),api('/quotation-templates')]).then(([c,p,productsList,t])=>{setCustomers(c);setPlans(p);setProducts(productsList);setTemplates(t);}).catch(e=>setError(e.message));},[canManage]);

  function beginCreate(){setEditing(null);setForm(emptyForm());setTemplateChoice('');setError('');setOpen(true);}
  function beginEdit(row){setEditing(row);setForm({customerId:row.customerId,planId:row.planId,planQuantity:row.planQuantity,planUnitPrice:String(row.planUnitPrice),lines:row.lines.map(line=>({productId:line.productId||'',variantId:line.variantId||'',quantity:line.quantity,unitPrice:String(line.unitPrice)})),startDate:row.startDate?.slice(0,10)||today(),expiryDate:row.expiryDate?.slice(0,10)||'',validUntil:row.validUntil?.slice(0,10)||'',paymentTerms:row.paymentTerms,taxRate:row.taxRate});setTemplateChoice('');setError('');setOpen(true);}
  function applyTemplate(id){setTemplateChoice(id);if(!id)return;const template=templates.find(item=>item.id===id);if(!template)return;const plan=plans.find(item=>item.id===template.planId);setForm(current=>({...current,planId:template.planId,planQuantity:template.planQuantity,planUnitPrice:String(template.planUnitPrice??plan?.price??''),lines:template.lines.map(line=>({productId:line.productId,variantId:line.variantId||'',quantity:line.quantity,unitPrice:String(line.unitPrice)})),taxRate:template.taxRate,paymentTerms:template.paymentTerms}));}
  async function save(event){event.preventDefault();setSaving(true);setError('');try{const payload={...form,planQuantity:Number(form.planQuantity),planUnitPrice:form.planUnitPrice===''?undefined:Number(form.planUnitPrice),taxRate:Number(form.taxRate),lines:form.lines.map(line=>({...line,quantity:Number(line.quantity),unitPrice:Number(line.unitPrice)}))};await api(editing?`/quotations/${editing.id}`:'/quotations',{method:editing?'PUT':'POST',body:JSON.stringify(payload)});setOpen(false);setNotice(editing?'Quotation updated.':'Quotation created as draft.');setTimeout(()=>setNotice(''),3000);await load();}catch(e){setError(e.message);}finally{setSaving(false);}}
  async function updateStatus(row,status){setError('');try{await api(`/quotations/${row.id}/status`,{method:'PATCH',body:JSON.stringify({status})});setNotice(`Quotation moved to ${statusNames[status]}.`);setTimeout(()=>setNotice(''),3000);await load();}catch(e){setError(e.message);}}
  async function convert(row){setError('');try{const result=await api(`/quotations/${row.id}/convert`,{method:'POST',body:'{}'});setNotice(`Converted to ${result.subscription.subscriptionNumber}; invoice ${result.invoice.invoiceNumber} created.`);setTimeout(()=>setNotice(''),5000);await load();}catch(e){setError(e.message);}}
  async function view(row){try{setViewing(await api(`/quotations/${row.id}`));}catch(e){setError(e.message);}}

  const selectedPlan=plans.find(plan=>plan.id===form.planId);
  const preview=useMemo(()=>{const planPrice=Number(form.planUnitPrice===''?selectedPlan?.price||0:form.planUnitPrice);const subtotal=planPrice*Number(form.planQuantity||0)+form.lines.reduce((sum,line)=>sum+Number(line.unitPrice||0)*Number(line.quantity||0),0);const tax=subtotal*Number(form.taxRate||0)/100;return {subtotal,tax,total:subtotal+tax};},[form,selectedPlan]);
  const columns=[
    {key:'quotationNumber',label:'Quotation'},
    {key:'customer',label:'Customer',render:(_,row)=>row.customer?.companyName},
    {key:'planName',label:'Plan'},
    {key:'total',label:'Total',render:(_,row)=>money(row.total)},
    {key:'validUntil',label:'Valid until',render:(_,row)=>date(row.validUntil)},
    {key:'status',label:'Status',render:(_,row)=><StatusBadge status={statusNames[row.status]||row.status}/>},
    {key:'actions',label:'',render:(_,row)=><div className="row-actions quote-actions">
      <button className="icon-btn" aria-label="View quotation" title="View" onClick={()=>view(row)}><Eye size={15}/></button>
      {canManage&&['DRAFT','QUOTATION'].includes(row.status)&&!row.convertedSubscriptionId&&<button className="icon-btn" aria-label="Edit quotation" title="Edit" onClick={()=>beginEdit(row)}><Pencil size={15}/></button>}
      {canManage&&row.status==='DRAFT'&&<button className="icon-btn" title="Issue quotation" aria-label="Issue quotation" onClick={()=>updateStatus(row,'QUOTATION')}><Send size={15}/></button>}
      {canManage&&row.status==='QUOTATION'&&<><button className="icon-btn" title="Confirm quotation" aria-label="Confirm quotation" onClick={()=>updateStatus(row,'CONFIRMED')}><Check size={15}/></button><button className="icon-btn danger" title="Reject quotation" aria-label="Reject quotation" onClick={()=>updateStatus(row,'REJECTED')}><ThumbsDown size={15}/></button></>}
      {canManage&&row.status==='CONFIRMED'&&!row.convertedSubscriptionId&&<button className="icon-btn" title="Convert to subscription" aria-label="Convert to subscription" onClick={()=>convert(row)}><ArrowRight size={15}/></button>}
      {row.convertedSubscription&&<span className="converted-label">{row.convertedSubscription.subscriptionNumber}</span>}
    </div>},
  ];

  return <>
    <div className="welcome-row"><div><div className="eyebrow">SALES</div><h1>{user?.role==='CUSTOMER'?'My quotations':'Quotations'}</h1><p>{user?.role==='CUSTOMER'?'Review quotations shared with your account.':'Prepare offers, confirm accepted terms, and convert them into subscriptions.'}</p></div><div className="welcome-actions"><Button variant="secondary" onClick={load}><RefreshCw size={15}/> Refresh</Button>{canManage&&<Button onClick={beginCreate}><Plus size={16}/> New quotation</Button>}</div></div>
    {notice&&<div className="success-notice">{notice}</div>}{error&&<div className="inline-error">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
    <section className="panel list-panel"><div className="list-toolbar"><div className="list-title"><span className="quick-icon violet"><FileText size={17}/></span><strong>All quotations</strong><span className="count-pill">{rows.length}</span></div></div><DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={load}/></section>

    <Modal open={open} onClose={()=>setOpen(false)} title={`${editing?'Edit':'Create'} quotation`}>
      <form className="resource-form quotation-form" onSubmit={save}>
        {templates.length>0&&<label>Start from template<select value={templateChoice} onChange={event=>applyTemplate(event.target.value)}><option value="">No template</option>{templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}
        <label>Customer<select required value={form.customerId} onChange={event=>setForm({...form,customerId:event.target.value})}><option value="">Choose a customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.companyName}</option>)}</select></label>
        <label>Plan<select required value={form.planId} onChange={event=>{const plan=plans.find(item=>item.id===event.target.value);setForm({...form,planId:event.target.value,planUnitPrice:plan?String(plan.price):''});}}><option value="">Choose a plan</option>{plans.map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {money(plan.price)}/{plan.billingInterval?.toLowerCase()}</option>)}</select></label>
        <div className="quote-grid-fields"><label>Plan quantity<input required type="number" min="1" step="1" value={form.planQuantity} onChange={event=>setForm({...form,planQuantity:event.target.value})}/></label><label>Plan unit price<input required type="number" min="0" step="0.01" value={form.planUnitPrice} onChange={event=>setForm({...form,planUnitPrice:event.target.value})}/></label></div>
        <QuoteLinesEditor lines={form.lines} setLines={lines=>setForm({...form,lines})} products={products}/>
        <div className="quote-grid-fields"><label>Start date<input required type="date" value={form.startDate} onChange={event=>setForm({...form,startDate:event.target.value})}/></label><label>Subscription expiry<input type="date" value={form.expiryDate} onChange={event=>setForm({...form,expiryDate:event.target.value})}/></label><label>Quotation valid until<input type="date" value={form.validUntil} onChange={event=>setForm({...form,validUntil:event.target.value})}/></label><label>Tax rate (%)<input required type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={event=>setForm({...form,taxRate:event.target.value})}/></label></div>
        <label>Payment terms<input required maxLength="100" placeholder="Net 14 days" value={form.paymentTerms} onChange={event=>setForm({...form,paymentTerms:event.target.value})}/><small>Use Net N days, Due on receipt, or Immediate.</small></label>
        <div className="quote-total-preview"><span>Subtotal <b>{money(preview.subtotal)}</b></span><span>Tax <b>{money(preview.tax)}</b></span><span>Total <b>{money(preview.total)}</b></span></div>
        {error&&<div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={saving}>{saving?'Saving…':editing?'Save changes':'Save draft'}</Button></div>
      </form>
    </Modal>

    <Modal open={Boolean(viewing)} onClose={()=>setViewing(null)} title={viewing?.quotationNumber||'Quotation details'}>
      {viewing&&<div className="quotation-detail">
        <div className="quotation-detail-grid"><span>Customer</span><strong>{viewing.customer?.companyName}</strong><span>Plan</span><strong>{viewing.planName} · {viewing.planQuantity} × {money(viewing.planUnitPrice)}</strong><span>Status</span><StatusBadge status={statusNames[viewing.status]||viewing.status}/><span>Start date</span><strong>{date(viewing.startDate)}</strong><span>Subscription expiry</span><strong>{date(viewing.expiryDate)}</strong><span>Quotation valid until</span><strong>{date(viewing.validUntil)}</strong><span>Payment terms</span><strong>{viewing.paymentTerms}</strong></div>
        <div className="table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{viewing.lines?.length?viewing.lines.map(line=><tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{money(line.unitPrice)}</td><td>{money(line.lineTotal)}</td></tr>):<tr><td colSpan="4">No additional products</td></tr>}</tbody></table></div>
        <div className="quote-total-preview"><span>Plan amount <b>{money(viewing.planUnitPrice*viewing.planQuantity)}</b></span><span>Subtotal <b>{money(viewing.subtotal)}</b></span><span>Tax ({viewing.taxRate}%) <b>{money(viewing.taxAmount)}</b></span><span>Total <b>{money(viewing.total)}</b></span></div>
        {viewing.convertedSubscription&&<div className="success-notice">Converted to subscription {viewing.convertedSubscription.subscriptionNumber}.</div>}
      </div>}
    </Modal>
  </>;
}
