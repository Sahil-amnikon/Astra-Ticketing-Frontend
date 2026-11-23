import { useSearchParams } from 'react-router-dom';
import ProblemWorkspace from '../problem-workspace';
export default function Page() {
  const [query] = useSearchParams();
  const params = Object.fromEntries(query);
  const value = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : '';
  return (
    <ProblemWorkspace
      key={value('problem') || (value('new') === '1' ? 'problem-create' : 'problem-list')}
      initialCreate={value('new') === '1'}
      initialProblem={value('problem')}
      initialTicket={value('ticket')}
      initialClient={value('client')}
    />
  );
}
