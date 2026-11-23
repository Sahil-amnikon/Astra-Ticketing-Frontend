export type KnowledgeDetails = {
  scope: 'GENERAL' | 'CLIENT_SPECIFIC'; articleType: string; product: string; version: string;
  environment: string; prerequisites: string; keywords: string; reviewDate: string;
  contentTitle?: string; errorMessage?: string;
};
export const detailsMarker = '[ASTRA_KB_DETAILS_V1]';
export const textMarker = '\n[ASTRA_KB_TEXT]\n';
export function readKnowledgeDetails(body: string): { text: string; details?: KnowledgeDetails } {
  if (!body.startsWith(detailsMarker)) return { text: body };
  const end = body.indexOf(textMarker);
  if (end < 0) return { text: body };
  try { return { text: body.slice(end + textMarker.length), details: JSON.parse(body.slice(detailsMarker.length, end)) }; }
  catch { return { text: body }; }
}
export function knowledgeDetailsFromForm(form: FormData): KnowledgeDetails {
  const value = (name: string) => String(form.get(name) ?? '').trim();
  return { contentTitle: value('contentTitle'), errorMessage: value('errorMessage'), scope: value('articleScope') as KnowledgeDetails['scope'], articleType: value('articleType'), product: value('product'), version: value('productVersion'), environment: value('environment'), prerequisites: value('prerequisites'), keywords: value('keywords'), reviewDate: value('reviewDate') };
}
const types = [['HOW_TO','How-to guide'],['TROUBLESHOOTING','Troubleshooting'],['FAQ','Frequently asked questions'],['KNOWN_ISSUE','Known issue / workaround'],['PROCEDURE','Procedure']] as const;
const environments = [['ALL','All environments'],['PRODUCTION','Production'],['TEST','Test'],['DEVELOPMENT','Development'],['STAGING','Staging']] as const;
export function KnowledgeScopeFields({details}:{details?:KnowledgeDetails}) {
  return <div className="v38-form-grid"><label>Article scope<select name="articleScope" defaultValue={details?.scope ?? 'GENERAL'}><option value="GENERAL">General guidance</option><option value="CLIENT_SPECIFIC">Client-specific guidance</option></select><small className="hint">General guidance is reusable. Client-specific guidance contains instructions for the selected client.</small></label><label>Article type<select name="articleType" defaultValue={details?.articleType ?? 'HOW_TO'}>{types.map(([code,name])=><option value={code} key={code}>{name}</option>)}</select></label></div>;
}
export function KnowledgeSpecifications({details}:{details?:KnowledgeDetails}) {
  return <fieldset className="kb-specifications"><legend>Specifications — what this applies to</legend><p className="hint">Optional. Describe the product and environment so readers can check whether the instructions apply to them.</p>
    <div className="kb-spec-grid"><label>Product / service<input name="product" maxLength={200} defaultValue={details?.product} placeholder="For example, Microsoft 365 or VPN" /></label><label>Version / platform<input name="productVersion" maxLength={150} defaultValue={details?.version} placeholder="For example, Windows 11 or Outlook desktop" /></label><label>Environment<select name="environment" defaultValue={details?.environment ?? 'ALL'}>{environments.map(([code,name])=><option value={code} key={code}>{name}</option>)}</select></label></div>
    <details className="kb-more-details" open={Boolean(details?.prerequisites || details?.keywords || details?.reviewDate)}><summary>More details (optional)</summary><div className="v38-stack"><label>Prerequisites<textarea name="prerequisites" rows={3} maxLength={2000} defaultValue={details?.prerequisites} placeholder="Required access, software, preparation or precautions" /></label><div className="v38-form-grid"><label>Keywords<input name="keywords" maxLength={500} defaultValue={details?.keywords} placeholder="For example, outlook, email, sign-in" /><small className="hint">Search terms to help people find this article. Keywords do not grant access.</small></label><label>Next review date<input type="date" name="reviewDate" defaultValue={details?.reviewDate} /><small className="hint">A date for checking accuracy. This does not automatically unpublish the article.</small></label></div></div></details>
  </fieldset>;
}
export function KnowledgeDetailsSummary({details}:{details?:KnowledgeDetails}) {
  if (!details) return null;
  const entries = [['Title',details.contentTitle],['Error message',details.errorMessage],['Scope',details.scope==='CLIENT_SPECIFIC'?'Client-specific guidance':'General guidance'],['Type',types.find(([code])=>code===details.articleType)?.[1]],['Product / service',details.product],['Version / platform',details.version],['Environment',environments.find(([code])=>code===details.environment)?.[1]],['Prerequisites',details.prerequisites],['Keywords',details.keywords],['Next review',details.reviewDate]];
  return <dl className="kb-details-summary">{entries.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
