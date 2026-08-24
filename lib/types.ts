export type UserRole = "member" | "company_user";
export type PostKind = "job" | "event" | "announcement" | "connection" | "job_link";
export type RoleType = "full_time" | "internship" | "coop";
export type TermSeason = "fall" | "winter" | "summer";
export type ApplicationKind = "in_app" | "off_platform";
export type ApplicationStage =
  | "submitted"
  | "reviewing"
  | "interviewing"
  | "offer"
  | "closed";
export type PostStatus = "open" | "closed";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_admin: boolean;
  program: string | null;
  grad_year: number | null;
  bio: string | null;
  interests: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  photo_path: string | null;
  created_at: string;
  resume_book_opt_in: boolean;
  resume_book_opt_in_at: string | null;
};

export type ProfileSection = {
  id: string;
  member_id: string;
  label: string;
  body: string;
  sort_order: number;
};

export type HiringPackage = {
  id: string;
  member_id: string;
  name: string;
  linkedin_url: string;
  resume_path: string;
  cover_letter: string | null;
  cover_letter_path: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  is_sponsor: boolean;
  logo_url: string | null;
  website: string | null;
  description: string | null;
  status: "active" | "inactive";
};

export type Post = {
  id: string;
  author_id: string;
  company_id: string | null;
  kind: PostKind;
  title: string;
  body: string;
  location: string | null;
  starts_at: string | null;
  published: boolean;
  status: PostStatus;
  role_type: RoleType | null;
  term_season: TermSeason | null;
  term_year: number | null;
  external_url: string | null;
  created_at: string;
  companies?: Company | null;
};

export type PostComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "photo_path"> | null;
};

export type Application = {
  id: string;
  member_id: string;
  kind: ApplicationKind;
  post_id: string | null;
  company_id: string | null;
  company_name: string | null;
  package_id: string | null;
  package_name: string | null;
  linkedin_url: string | null;
  resume_path: string | null;
  cover_letter: string | null;
  cover_letter_path: string | null;
  stage: ApplicationStage;
  notes: string | null;
  created_at: string;
  posts?: Post | null;
  profiles?: Profile | null;
};

export type Conversation = {
  id: string;
  member_id: string;
  company_id: string;
  member_last_read_at: string | null;
  company_last_read_at: string | null;
  created_at: string;
  companies?: Company | null;
  profiles?: Pick<Profile, "id" | "full_name" | "photo_path"> | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type JoinRequest = {
  id: string;
  company_name: string;
  website: string | null;
  contact_name: string;
  contact_email: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

/** Unwrap a Supabase relation that may be an object or a one-element array. */
export function one<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export function isPlatformJob(post: Pick<Post, "kind" | "external_url">) {
  return post.kind === "job" && !post.external_url;
}

export function isInAppJob(post: Pick<Post, "kind" | "external_url" | "status" | "published">) {
  return isPlatformJob(post) && post.status === "open" && post.published;
}

export function kindLabel(kind: PostKind) {
  switch (kind) {
    case "job":
      return "Job";
    case "job_link":
      return "External job";
    case "event":
      return "Event";
    case "announcement":
      return "Announcement";
    case "connection":
      return "Connection";
  }
}

export function roleTypeLabel(role: RoleType | null) {
  if (role === "full_time") return "Full-time";
  if (role === "internship") return "Internship";
  if (role === "coop") return "Co-op";
  return null;
}

export function termLabel(season: TermSeason | null, year: number | null) {
  if (!season || !year) return null;
  const s = season[0].toUpperCase() + season.slice(1);
  return `${s} ${year}`;
}
