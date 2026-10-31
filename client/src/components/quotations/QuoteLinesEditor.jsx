import {Plus,Trash2} from 'lucide-react';
import Button from '../common/Button';

export default function QuoteLinesEditor({lines,setLines,products}){
  function add(){setLines([...lines,{productId:'',variantId:'',quantity:1,unitPrice:''}]);}
  function patch(index,changes){setLines(lines.map((line,i)=>i===index?{...line,...changes}:line));}
  function chooseProduct(index,productId){
    const product=products.find(item=>item.id===productId);
    patch(index,{productId,variantId:'',unitPrice:product?String(product.salesPrice):''});
  }
  function chooseVariant(index,productId,variantId){
    const product=products.find(item=>item.id===productId);
    const variant=product?.variants?.find(item=>item.id===variantId);
    patch(index,{variantId,unitPrice:product?String(Number(product.salesPrice)+(variant?.additionalPrice||0)):''});
  }
  return <div className="quote-lines-editor">
    <div className="quote-lines-heading"><strong>Product lines</strong><Button type="button" variant="secondary" onClick={add}><Plus size={14}/> Add product</Button></div>
    {!lines.length&&<p className="quote-lines-empty">No additional products. The selected plan will still be included.</p>}
    {lines.map((line,index)=>{
      const product=products.find(item=>item.id===line.productId);
      return <div className="quote-line-fields" key={index}>
        <label>Product<select required value={line.productId} onChange={event=>chooseProduct(index,event.target.value)}><option value="">Select product</option>{products.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Variant<select value={line.variantId||''} disabled={!product?.variants?.length} onChange={event=>chooseVariant(index,line.productId,event.target.value)}><option value="">{product?.variants?.length?'No variant':'No variants'}</option>{product?.variants?.map(variant=><option key={variant.id} value={variant.id}>{variant.attribute}: {variant.value}</option>)}</select></label>
        <label>Qty<input required type="number" min="1" step="1" value={line.quantity} onChange={event=>patch(index,{quantity:event.target.value})}/></label>
        <label>Unit price<input required type="number" min="0" step="0.01" value={line.unitPrice} onChange={event=>patch(index,{unitPrice:event.target.value})}/></label>
        <button type="button" className="icon-btn danger quote-line-remove" aria-label="Remove product line" onClick={()=>setLines(lines.filter((_,i)=>i!==index))}><Trash2 size={16}/></button>
      </div>;
    })}
  </div>;
}
