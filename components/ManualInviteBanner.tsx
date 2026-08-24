import CopyLink from "@/components/CopyLink";

export default function ManualInviteBanner({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  return (
    <div className="mb-8 border border-blue-light/30 p-5">
      <p className="text-sm text-blue-light">
        Email sending is rate-limited, so no invite email went out. Share this login with{" "}
        <span className="text-white">{email}</span>. They can sign in at the site, then set their
        own password.
      </p>
      <p className="mt-3 text-[11px] uppercase tracking-[2px] text-white/60">Temporary password</p>
      <div className="mt-2">
        <CopyLink value={password} label="Copy password" />
      </div>
    </div>
  );
}
