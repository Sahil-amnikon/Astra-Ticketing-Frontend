import { ChangeChoice } from './change-request-fields';
import type { TicketCategory } from './ticket-category-selection';
export default function TicketCategoryFields({categories,parents,children,onParents,onChildren}:{categories:TicketCategory[];parents:string[];children:string[];onParents:(ids:string[])=>void;onChildren:(ids:string[])=>void}){
  const roots=categories.filter(item=>!item.parent_id);
  const subs=categories.filter(item=>item.parent_id&&parents.includes(item.parent_id));
  return <>
    <ChangeChoice label="Category" name="selectedCategoryParents" items={roots} values={parents} onChange={ids=>{onParents(ids);onChildren(children.filter(id=>categories.some(item=>item.id===id&&item.parent_id&&ids.includes(item.parent_id))));}} multiple all allLabel="All categories"/>
    <ChangeChoice label="Subcategory" name="selectedCategoryChildren" items={subs} values={children} onChange={onChildren} multiple all allLabel="All subcategories" disabled={!subs.length}/>
    <p className="field-help span-2">Select one or more categories, then a subcategory for each category that has them. All selects the current available options. The first selected category is the primary category for routing and reports.</p>
  </>;
}
