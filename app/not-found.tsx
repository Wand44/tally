import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-6xl flex-col items-center justify-center px-4 text-center sm:px-6">
      <p className="text-xs uppercase tracking-[0.24em] text-muted">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-serif)' }}>
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        This page doesn&apos;t exist. Head back to the dashboard to keep things moving.
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        Back to dashboard
      </Link>
    </main>
  );
}
