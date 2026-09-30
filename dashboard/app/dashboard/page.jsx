import { readSnapshot } from '@/lib/store';
import DashboardView from '../components/DashboardView';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const snapshot = await readSnapshot();
  return <DashboardView snapshot={snapshot} />;
}
