import { useParams } from 'react-router-dom';
import ChangeWorkspace from '../../change-workspace';
export default function Page() {
  const { id } = useParams() as { id: string };
  return <ChangeWorkspace view="detail" changeId={id} />;
}
