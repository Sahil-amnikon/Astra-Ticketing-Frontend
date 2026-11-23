import { useSearchParams } from 'react-router-dom';
import KnowledgeWorkspace from '../knowledge/knowledge-workspace';
export default function Page() {
  const [query]=useSearchParams();
  const creationPage=query.get('new')==='1';
  return <KnowledgeWorkspace catalogue creationPage={creationPage} key={creationPage?'create':'list'} />;
}
