import {CircleAlert,Database,RefreshCw} from 'lucide-react';
export default function DataTable({columns,rows,loading,error,onRetry}){
 if(loading)return <div className="state state-loading" role="status" aria-live="polite"><span className="state-icon"><RefreshCw size={18}/></span><strong>Loading records</strong><span>Getting the latest information…</span></div>;
 if(error)return <div className="state state-error" role="alert"><span className="state-icon"><CircleAlert size={18}/></span><strong>Could not load records</strong><span>{error}</span>{onRetry&&<button className="btn btn-secondary" type="button" onClick={onRetry}>Try again</button>}</div>;
 if(!rows.length)return <div className="state state-empty"><span className="state-icon"><Database size={18}/></span><strong>No records yet</strong><span>Create your first record to see it here.</span></div>;
 return <div className="table-wrap"><table><thead><tr>{columns.map(column=><th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id||index}>{columns.map(column=><td key={column.key}>{column.render?column.render(row[column.key],row):row[column.key]??'—'}</td>)}</tr>)}</tbody></table></div>;
}
