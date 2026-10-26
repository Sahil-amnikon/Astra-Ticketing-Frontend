import ChangeWorkspace from '../../../src/pages/Changes/ChangeWorkspace';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChangeWorkspace view="detail" changeId={id} />;
}
