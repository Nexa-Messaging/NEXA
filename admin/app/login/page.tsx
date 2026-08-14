import LoginForm from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const notice =
    params.reason === 'not_admin'
      ? 'Your account does not have administrator access.'
      : null;

  return <LoginForm notice={notice} />;
}
