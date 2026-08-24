import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-5 py-20">
      <p className="text-xs uppercase tracking-wider text-blue-light">404</p>
      <h1 className="mt-2 font-heading text-2xl font-bold text-white">Not found</h1>
      <p className="mt-4 text-sm text-white/60">
        That page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white"
      >
        Go back
      </Link>
    </div>
  );
}
