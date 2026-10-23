import Link from "next/link";
import { LockKeyhole, Mail, MapPin, Phone } from "lucide-react";
import { legalLinks, navLinks } from "@/data/site";
import { getSiteSettings } from "@/lib/content";
import { mailHref, telHref } from "@/lib/utils";
import Logo from "@/components/brand/Logo";
import SocialLinks from "@/components/navigation/SocialLinks";
import BuiltBy from "./BuiltBy";

export default async function SiteFooter() {
  const site = await getSiteSettings();
  const link = "text-ivory/75 transition-colors hover:text-ivory";

  return (
    // Extra bottom padding on mobile leaves room for the sticky contact bar
    <footer className="bg-forest-deep pb-24 text-ivory md:pb-0">
      <div className="mx-auto max-w-7xl px-5 pt-12 md:px-8 md:pt-14 2xl:max-w-[84rem]">
        <div className="grid gap-10 md:grid-cols-[1fr_auto] lg:grid-cols-[1.1fr_1.6fr_auto_1.1fr] lg:items-center lg:gap-10">
          <div>
            <Link href="/" aria-label={`${site.name} — home`} className="inline-block">
              <Logo tone="ivory" size="lg" />
            </Link>
            <p className="mt-4 text-[0.8rem] text-ivory/60">{site.tagline}</p>
          </div>

          <nav aria-label="Footer" className="lg:justify-self-center">
            <ul className="flex flex-wrap gap-x-7 gap-y-3 text-[0.85rem]">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={link}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <SocialLinks className="text-ivory/85" />

          <address className="space-y-2 text-[0.85rem] not-italic">
            <p className="flex items-center gap-2.5 text-ivory/75">
              <MapPin className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              {site.address.street}, {site.address.city}, {site.address.country}
            </p>
            {site.phones.map((p) => (
              <a key={p.e164} href={telHref(site, p.e164)} className={`${link} flex w-fit items-center gap-2.5`}>
                <Phone className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                {p.label}
              </a>
            ))}
            <a href={mailHref(site)} className={`${link} flex w-fit items-center gap-2.5 break-all`}>
              <Mail className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              {site.email}
            </a>
          </address>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-ivory/10 py-6 text-[0.78rem] text-ivory/55 md:flex-row md:items-center md:justify-between md:pr-20">
          <p>
            &copy; {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <ul className="flex gap-6">
              {legalLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-ivory">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                {/* Staff sign-in; signed-out visitors land on /admin/login */}
                <Link href="/admin" prefetch={false} rel="nofollow" className="flex items-center gap-1.5 transition-colors hover:text-ivory">
                  <LockKeyhole className="size-3.5" strokeWidth={1.5} aria-hidden />
                  Admin
                </Link>
              </li>
            </ul>
            <span className="hidden h-3 w-px bg-ivory/20 sm:block" aria-hidden />
            <BuiltBy />
          </div>
        </div>
      </div>
    </footer>
  );
}
