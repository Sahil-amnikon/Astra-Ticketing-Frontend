import { useSearchParams } from 'react-router-dom';
import KnowledgeWorkspace from './knowledge-workspace';
export default function Page() {
  const [query]=useSearchParams();
  const creationPage=query.get('new')==='1';
  const articleId=creationPage?'':query.get('article')??'';
  return <KnowledgeWorkspace creationPage={creationPage} articleId={articleId} key={creationPage?'create':articleId||'list'} />;
}
