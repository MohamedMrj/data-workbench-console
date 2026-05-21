import Link from 'next/link';

export const metadata = {
  title: 'Access denied - Data Workbench Console'
};

export default function AccessDeniedPage() {
  return (
    <main className="access-page">
      <section className="access-card surface">
        <div className="eyebrow">Access denied</div>
        <h1>Your Microsoft account is not allowed for this workspace.</h1>
        <p>
          Ask the app owner to add your email address to the production
          <code> ALLOWED_USER_EMAILS </code>
          setting, then sign in again.
        </p>
        <div className="button-row wrap">
          <Link href="/api/auth/signin" className="primary-btn">Sign in with another account</Link>
          <Link href="/api/auth/signout" className="ghost-btn">Sign out</Link>
        </div>
      </section>
    </main>
  );
}
