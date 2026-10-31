import {NavLink} from 'react-router-dom';
import {LayoutDashboard,Users,Package,Layers,RefreshCw,Sparkles,X,Receipt,CreditCard,UserRound,FileText,Files,Percent,LogOut} from 'lucide-react';
import {useAuth} from '../../context/AuthContext';

const common=[['/customers','Customers',Users],['/products','Products',Package],['/plans','Plans',Layers]];
const billing=[['/subscriptions','Subscriptions',RefreshCw],['/quotations','Quotations',FileText],['/invoices','Invoices',Receipt],['/payments','Payments',CreditCard]];
export default function Sidebar({open=false,onClose=()=>{}}){
 const {user,logout}=useAuth();
 const groups=user?.role==='CUSTOMER'?
  [['ACCOUNT',[['/portal','My portal',UserRound],...billing]]]:
  [['WORKSPACE',[['/','Overview',LayoutDashboard]]],['MANAGE',common],['BILLING',billing],...(user?.role==='ADMIN'?[['SETTINGS',[['/quotation-templates','Quote templates',Files],['/discounts','Discounts & tax',Percent]]]]:[])];
 const initial=user?.name?.trim()?.[0]?.toUpperCase()||'U';
 return <>{open&&<button className="mobile-overlay" aria-label="Close navigation" onClick={onClose}/>}<aside className={`sidebar ${open?'open':''}`}>
  <div className="brand"><span className="brand-icon"><Sparkles size={18}/></span><span>subscriptly</span><button className="icon-btn mobile-close" onClick={onClose} aria-label="Close navigation"><X size={19}/></button></div>
  <div className="workspace"><span className="workspace-dot"/><span>Workspace</span><span className="workspace-plan">{user?.role==='ADMIN'?'Admin':'Team'}</span></div>
  <nav className="sidebar-nav">{groups.map(([group,items])=><div className="nav-group" key={group}><div className="nav-label">{group}</div>{items.map(([to,label,Icon])=><NavLink end={to==='/'} key={to} to={to} title={label} onClick={onClose} className={({isActive})=>`nav-link ${isActive?'active':''}`}><Icon size={17}/><span>{label}</span></NavLink>)}</div>)}</nav>
  <div className="side-bottom"><div className="help-card"><div className="help-mark">✦</div><strong>Need a hand?</strong><p>Find guidance for managing subscriptions and billing.</p><a href="mailto:help@subscriptly.local">Contact support <span>↗</span></a></div>
   <div className="sidebar-profile"><div className="avatar">{initial}</div><div className="user-text"><strong>{user?.name}</strong><span>{user?.role?.toLowerCase()}</span></div><button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={16}/></button></div>
   <div className="version"><span>Subscriptly</span><span>Phase 4</span></div>
  </div>
 </aside></>;
}
