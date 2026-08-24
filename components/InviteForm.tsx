"use client";

import { useState } from "react";
import { Field, PrimaryButton, TextInput } from "@/components/Form";
import { invitePerson } from "@/lib/actions/admin";

const KINDS = [
  {
    id: "member",
    title: "Club member",
    hint: "Sees the feed, applies to roles, and shows up in the directory.",
  },
  {
    id: "admin",
    title: "Exec admin",
    hint: "A member who can also invite people, approve firms, and post for the club.",
  },
  {
    id: "company",
    title: "Company contact",
    hint: "Posts jobs for their firm only. They do not get the member feed.",
  },
] as const;

type Kind = (typeof KINDS)[number]["id"];

export default function InviteForm({
  companies,
  initialKind = "member",
  error,
  sent,
}: {
  companies: { id: string; name: string }[];
  initialKind?: Kind;
  error?: string;
  sent?: boolean;
}) {
  const [kind, setKind] = useState<Kind>(
    KINDS.some((k) => k.id === initialKind) ? initialKind : "member",
  );

  return (
    <form action={invitePerson} className="space-y-6">
      <input type="hidden" name="kind" value={kind} />
      <fieldset>
        <legend className="text-[11px] uppercase tracking-wider text-white/60">Who is this?</legend>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {KINDS.map((option) => {
            const selected = kind === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setKind(option.id)}
                className={`border p-4 text-left ${
                  selected ? "border-blue-light bg-white/5" : "border-white/10 hover:border-white/20"
                }`}
              >
                <p className="font-heading text-base font-bold text-white">{option.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/60">{option.hint}</p>
              </button>
            );
          })}
        </div>
      </fieldset>

      {sent && (
        <p className="text-sm text-blue-light">
          Invite email sent. They’ll set a password from the link.
        </p>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name">
          <TextInput name="full_name" required autoComplete="name" />
        </Field>
        <Field label="Email">
          <TextInput name="email" type="email" required autoComplete="email" />
        </Field>
      </div>

      {kind === "company" && (
        <div className="space-y-4 border border-white/10 p-4">
          <p className="text-sm text-white/55">Which firm are they joining?</p>
          <Field label="Existing company">
            <select name="company_id" className="w-full rounded px-3 py-2 text-sm">
              <option value="">Create a new company below</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Or new company name">
            <TextInput name="new_company_name" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" name="is_sponsor" />
            Mark as a QUANTT sponsor
          </label>
        </div>
      )}

      <PrimaryButton type="submit">
        {kind === "admin"
          ? "Invite exec admin"
          : kind === "company"
            ? "Invite company contact"
            : "Invite club member"}
      </PrimaryButton>
    </form>
  );
}
