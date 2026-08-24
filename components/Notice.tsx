import { DENIAL_MESSAGES } from "@/lib/denials";

export default function Notice({ message }: { message?: string }) {
  const text = message ? DENIAL_MESSAGES[message] : undefined;
  if (!text) return null;
  return (
    <p
      role="alert"
      className="mb-6 rounded border border-blue-light/40 bg-blue-light/10 px-4 py-3 text-sm text-white/80"
    >
      {text}
    </p>
  );
}
