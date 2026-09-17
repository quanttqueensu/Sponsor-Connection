"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import type { Profile } from "@/lib/types";

type Props = {
  profile: Profile;
  unread?: number;
};

export default function HubNav({ profile, unread = 0 }: Props) {
  const pathname = usePathname();
  const isCompany = profile.role === "company_user";

  const links = isCompany
    ? [
        { href: "/company", label: "Posts" },
        { href: "/company/applicants", label: "Applicants" },
        { href: "/company/resume-book", label: "Resume book" },
        { href: "/company/search", label: "Search" },
        { href: "/company/messages", label: "Messages" },
        { href: "/company/sponsorship", label: "Sponsorship" },
      ]
    : [
        { href: "/feed", label: "Feed" },
        { href: "/applications", label: "Applications" },
        { href: "/packages", label: "Packages" },
        { href: "/members", label: "Members" },
        { href: "/messages", label: "Messages" },
        { href: "/profile", label: "Profile" },
      ];

  if (profile.is_admin) {
    links.push({ href: "/admin", label: "Admin" });
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-navy/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href={isCompany ? "/company" : "/feed"} className="flex items-center gap-2">
          <Image
            src="/images/logos/quantt-icon.png"
            alt=""
            width={32}
            height={32}
            className="h-7 w-7"
            priority
          />
          <span className="text-[13px] font-bold tracking-[2px] text-white">
            QUANTT
            <span className="ml-1.5 font-normal tracking-wide text-white/60">Hub</span>
          </span>
        </Link>
        <div className="flex max-w-[70%] items-center gap-4 overflow-x-auto md:max-w-none">
          {links.map((link) => {
            const active =
              link.href === "/company"
                ? pathname === "/company" || pathname.startsWith("/company/posts")
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            const showBadge = link.label === "Messages" && unread > 0;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative text-[11px] uppercase tracking-[1px] ${
                  active ? "text-white" : "text-white/55 hover:text-white/80"
                }`}
              >
                {link.label}
                {showBadge && (
                  <span className="absolute -right-2 -top-1 h-1.5 w-1.5 rounded-full bg-blue-light" />
                )}
              </Link>
            );
          })}
          <form action={logout}>
            <button
              type="submit"
              className="text-[11px] uppercase tracking-[1px] text-white/60 hover:text-white"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
