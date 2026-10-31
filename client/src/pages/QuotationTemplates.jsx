import {useEffect,useState} from 'react';
import {ArrowLeft,FilePlus2,Layers,Pencil,Plus,RefreshCw,Trash2} from 'lucide-react';
import {Link,Navigate} from 'react-router-dom';
import {api} from '../services/api';
import {useAuth} from '../context/AuthContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';
import QuoteLinesEditor from '../components/quotations/QuoteLinesEditor';

const money=value=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(value)||0);
const emptyForm=()=>({name:'',description:'',planId:'',planQuantity:1,planUnitPrice:'',taxRate:0,paymentTerms:'Net 14 days',lines:[]});

export default function QuotationTemplates(){
  const {user}=useAuth();
  const isAdmin=user?.role==='ADMIN';
  const [rows,setRows]=useState([]),[plans,setPlans]=useState([]),[products,setProducts]=useState([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[open,setOpen]=useState(false),[editing,setEditing]=useState(null),[form,setForm]=useState(emptyForm()),[saving,setSaving]=useState(false);
  async function load(){setLoading(true);try{const [templates,planRows,productRows]=await Promise.all([api('/quotation-templates'),api('/plans'),api('/products')]);setRows(templates);setPlans(planRows);setProducts(productRows);setError('');}catch(e){setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{if(isAdmin)load();},[isAdmin]);
  if(!isAdmin)return <Navigate to="/quotations" replace/>;
  function openForm(row=null){setEditing(row);setForm(row?{name:row.name,description:row.description||'',planId:row.planId,planQuantity:row.planQuantity,planUnitPrice:row.planUnitPrice==null?'':String(row.planUnitPrice),taxRate:row.taxRate,paymentTerms:row.paymentTerms,lines:row.lines.map(line=>({productId:line.productId,variantId:line.variantId||'',quantity:line.quantity,unitPrice:String(line.unitPrice)}))}:emptyForm());setError('');setOpen(true);}
  async function save(event){event.preventDefault();setSaving(true);setError('');try{const payload={...form,planQuantity:Number(form.planQuantity),planUnitPrice:form.planUnitPrice===''?undefined:Number(form.planUnitPrice),taxRate:Number(form.taxRate),lines:form.lines.map(line=>({...line,quantity:Number(line.quantity),unitPrice:Number(line.unitPrice)}))};await api(editing?`/quotation-templates/${editing.id}`:'/quotation-templates',{method:editing?'PUT':'POST',body:JSON.stringify(payload)});setOpen(false);setNotice(editing?'Template updated.':'Template created.');setTimeout(()=>setNotice(''),3000);await load();}catch(e){setError(e.message);}finally{setSaving(false);}}
  async function remove(row){if(!window.confirm(`Delete template “${row.name}”?`))return;try{await api(`/quotation-templates/${row.id}`,{method:'DELETE'});setNotice('Template deleted.');setTimeout(()=>setNotice(''),3000);await load();}catch(e){setError(e.message);}}
  const columns=[{key:'name',label:'Template'},{key:'plan',label:'Plan',render:(_,row)=>row.plan?.name},{key:'lines',label:'Products',render:(_,row)=>row.lines?.length||0},{key:'taxRate',label:'Tax',render:(_,row)=>`${row.taxRate}%`},{key:'paymentTerms',label:'Terms'},{key:'actions',label:'',render:(_,row)=><div className="row-actions"><button className="icon-btn" title="Edit template" aria-label="Edit template" onClick={()=>openForm(row)}><Pencil size={15}/></button><button className="icon-btn danger" title="Delete template" aria-label="Delete template" onClick={()=>remove(row)}><Trash2 size={15}/></button></div>}];
  return <>
    <div className="welcome-row"><div><div className="eyebrow">SALES SETUP</div><h1>Quotation templates</h1><p>Save common plans, product lines, tax rates, and payment terms for reuse.</p></div><div className="welcome-actions"><Link to="/quotations"><Button type="button" variant="secondary"><ArrowLeft size={15}/> Quotations</Button></Link><Button onClick={()=>openForm()}><Plus size={16}/> New template</Button></div></div>
    {notice&&<div className="success-notice">{notice}</div>}{error&&<div className="inline-error">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
    <section className="panel list-panel"><div className="list-toolbar"><div className="list-title"><span className="quick-icon green"><Layers size={17}/></span><strong>Saved templates</strong><span className="count-pill">{rows.length}</span></div><Button variant="secondary" onClick={load}><RefreshCw size={15}/> Refresh</Button></div><DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={load}/></section>
    <div className="info-banner"><FilePlus2 size={15}/> Templates are applied when drafting a quotation. Editing a template does not change quotations already created.</div>
    <Modal open={open} onClose={()=>setOpen(false)} title={`${editing?'Edit':'Create'} quotation template`}>
      <form className="resource-form quotation-form" onSubmit={save}>
        <label>Template name<input required maxLength="100" value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label>
        <label>Description (optional)<input maxLength="500" value={form.description} onChange={event=>setForm({...form,description:event.target.value})}/></label>
        <label>Plan<select required value={form.planId} onChange={event=>{const plan=plans.find(item=>item.id===event.target.value);setForm({...form,planId:event.target.value,planUnitPrice:plan?String(plan.price):''});}}><option value="">Choose a plan</option>{plans.map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {money(plan.price)}/{plan.billingInterval?.toLowerCase()}</option>)}</select></label>
        <div className="quote-grid-fields"><label>Plan quantity<input required type="number" min="1" step="1" value={form.planQuantity} onChange={event=>setForm({...form,planQuantity:event.target.value})}/></label><label>Plan unit price<input type="number" min="0" step="0.01" value={form.planUnitPrice} onChange={event=>setForm({...form,planUnitPrice:event.target.value})}/></label><label>Tax rate (%)<input required type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={event=>setForm({...form,taxRate:event.target.value})}/></label></div>
        <label>Payment terms<input required maxLength="100" placeholder="Net 14 days" value={form.paymentTerms} onChange={event=>setForm({...form,paymentTerms:event.target.value})}/><small>Use Net N days, Due on receipt, or Immediate.</small></label>
        <QuoteLinesEditor lines={form.lines} setLines={lines=>setForm({...form,lines})} products={products}/>
        {error&&<div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={saving}>{saving?'Saving…':editing?'Save template':'Create template'}</Button></div>
      </form>
    </Modal>
  </>;
}
