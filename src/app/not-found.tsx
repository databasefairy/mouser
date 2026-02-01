import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">404</h1>
        <p className="text-slate-600 mb-4">This page could not be found.</p>
        <Link href="/" className="text-slate-900 font-medium underline">
          Go home
        </Link>
      </div>
    </main>
  );
}
