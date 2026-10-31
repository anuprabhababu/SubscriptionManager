import {useEffect} from 'react';
import {X} from 'lucide-react';
export default function Modal({open,onClose,title,children}){
 useEffect(()=>{if(!open)return;const closeOnEscape=event=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',closeOnEscape);return()=>document.removeEventListener('keydown',closeOnEscape);},[open,onClose]);
 if(!open)return null;
 return <div className="modal-shade" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header className="modal-head"><h2>{title}</h2><button className="icon-btn" type="button" onClick={onClose} aria-label="Close dialog"><X size={19}/></button></header>{children}</section></div>;
}
