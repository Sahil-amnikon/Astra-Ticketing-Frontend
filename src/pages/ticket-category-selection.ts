export type TicketCategory={id:string;name:string;parent_id?:string|null};
export function ticketCategorySelection(categories:TicketCategory[],parents:string[],children:string[]):{ids:string[];primary:string;error?:string}{
  if(!parents.length)return {ids:[],primary:'',error:'Select at least one category.'};
  const ids:string[]=[];
  for(const parent of [...new Set(parents)]){
    if(!categories.some(item=>item.id===parent&&!item.parent_id))return {ids:[],primary:'',error:'A selected category is no longer available.'};
    const available=categories.filter(item=>item.parent_id===parent);
    const selected=[...new Set(children)].filter(id=>available.some(item=>item.id===id));
    if(available.length&&!selected.length)return {ids:[],primary:'',error:'Select a subcategory for '+categories.find(item=>item.id===parent)!.name+'.'};
    ids.push(...(available.length?selected:[parent]));
  }
  return {ids,primary:ids[0]??''};
}
