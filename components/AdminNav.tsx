"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";

const LINKS = [
  { href: "/admin/invite", label: "Invite" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/posts", label: "Posts" },
  { href: "/admin/applications", label: "Applications" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-navy/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/admin" className="flex items-center gap-2">
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
            <span className="ml-1.5 font-normal tracking-wide text-blue-light/80">Admin</span>
          </span>
        </Link>
        <div className="flex max-w-[70%] items-center gap-4 overflow-x-auto md:max-w-none">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[11px] uppercase tracking-[1px] ${
                  active ? "text-white" : "text-white/55 hover:text-white/80"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/feed"
            className="text-[11px] uppercase tracking-[1px] text-white/60 hover:text-white"
          >
            Club
          </Link>
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
