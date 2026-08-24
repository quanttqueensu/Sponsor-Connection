"use client";

import { useState } from "react";
import { Field, PrimaryButton, TextArea, TextInput } from "@/components/Form";
import { createPost } from "@/lib/actions/posts";
import type { PostKind } from "@/lib/types";

export default function PostForm({
  kinds,
  companies,
  redirectTo,
}: {
  kinds: PostKind[];
  companies?: { id: string; name: string }[];
  redirectTo?: string;
}) {
  const [kind, setKind] = useState<PostKind>(kinds[0] ?? "announcement");
  const [externalUrl, setExternalUrl] = useState("");
  const isInAppJob = kind === "job" && externalUrl.trim() === "";
  const isEvent = kind === "event";
  // job_link_has_url (0001_init.sql:133) rejects a job_link with no URL.
  const urlRequired = kind === "job_link";

  return (
    <form action={createPost} className="max-w-lg space-y-4">
      {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}
      <Field label="Type">
        <select
          name="kind"
          required
          value={kind}
          onChange={(e) => setKind(e.target.value as PostKind)}
          className="w-full rounded px-3 py-2 text-sm"
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k.replace("_", " ")}
            </option>
          ))}
        </select>
      </Field>
      {companies && (
        <Field label="Company (optional, for admin posts)">
          <select name="company_id" className="w-full rounded px-3 py-2 text-sm">
            <option value="">None</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Title">
        <TextInput name="title" required />
      </Field>
      <Field label="Body">
        <TextArea name="body" rows={6} required />
      </Field>
      <Field label="Location">
        <TextInput name="location" />
      </Field>
      {isEvent && (
        <Field label="Starts at">
          <TextInput name="starts_at" type="datetime-local" required />
        </Field>
      )}
      {isInAppJob && (
        <>
          <Field label="Role type">
            <select name="role_type" required className="w-full rounded px-3 py-2 text-sm">
              <option value="">Choose one</option>
              <option value="full_time">Full-time</option>
              <option value="internship">Internship</option>
              <option value="coop">Co-op</option>
            </select>
          </Field>
          <Field label="Term season">
            <select name="term_season" required className="w-full rounded px-3 py-2 text-sm">
              <option value="">Choose one</option>
              <option value="fall">Fall</option>
              <option value="winter">Winter</option>
              <option value="summer">Summer</option>
            </select>
          </Field>
          <Field label="Term year">
            <TextInput name="term_year" type="number" required placeholder="2027" />
          </Field>
        </>
      )}
      <Field label={urlRequired ? "External listing URL" : "External listing URL (optional)"}>
        <TextInput
          name="external_url"
          type="url"
          required={urlRequired}
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
        />
        <p className="mt-1 text-xs text-white/60">
          {urlRequired
            ? "A job link points members at a listing elsewhere, so it needs a full http:// or https:// address."
            : "Leave blank to accept applications in the hub. Add a URL to send members to your own careers page instead."}
        </p>
      </Field>
      <PrimaryButton type="submit">Publish</PrimaryButton>
    </form>
  );
}
