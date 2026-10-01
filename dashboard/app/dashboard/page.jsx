import { readSnapshot } from '@/lib/store';
import Board from '../components/Board';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const snapshot = await readSnapshot();
  return <Board initial={snapshot} />;
}
