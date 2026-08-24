export default function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-6 rounded border border-blue-light/40 bg-blue-light/10 px-4 py-3 text-sm text-white/80">
      {message}
    </p>
  );
}
