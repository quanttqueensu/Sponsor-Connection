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
  return (
    <form action={createPost} className="max-w-lg space-y-4">
      {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}
      <Field label="Type">
        <select name="kind" required className="w-full rounded px-3 py-2 text-sm">
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
      <Field label="Starts at (events)">
        <TextInput name="starts_at" type="datetime-local" />
      </Field>
      <Field label="Role type (in-app jobs)">
        <select name="role_type" className="w-full rounded px-3 py-2 text-sm">
          <option value="">—</option>
          <option value="full_time">Full-time</option>
          <option value="internship">Internship</option>
          <option value="coop">Co-op</option>
        </select>
      </Field>
      <Field label="Term season">
        <select name="term_season" className="w-full rounded px-3 py-2 text-sm">
          <option value="">—</option>
          <option value="fall">Fall</option>
          <option value="winter">Winter</option>
          <option value="summer">Summer</option>
        </select>
      </Field>
      <Field label="Term year">
        <TextInput name="term_year" type="number" placeholder="2027" />
      </Field>
      <Field label="External listing URL (off-platform jobs / job links)">
        <TextInput name="external_url" type="url" />
      </Field>
      <PrimaryButton type="submit">Publish</PrimaryButton>
    </form>
  );
}
