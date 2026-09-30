import LoginPage from './components/LoginPage';

export const dynamic = 'force-dynamic';

export default function Home() {
  // Demo mode = no access key configured on the deployment.
  const demoMode = !process.env.DASHBOARD_ACCESS_KEY;
  return <LoginPage demoMode={demoMode} />;
}
