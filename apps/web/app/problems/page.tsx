import ProblemWorkspace from '../problem-workspace';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : '';
  return (
    <ProblemWorkspace
      initialProblem={value('problem')}
      initialTicket={value('ticket')}
      initialClient={value('client')}
    />
  );
}
