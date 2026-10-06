import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { legalLinks, navLinks, siteSettings as site } from "@/data/site";
import { getServices } from "@/lib/content";
import { mailHref, telHref, whatsappHref } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import SocialLinks from "@/components/navigation/SocialLinks";
import Wordmark from "@/components/ui/Wordmark";

const FOOTER_SERVICES = [
  "wedding-decoration",
  "birthday-decoration",
  "engagement-decoration",
  "corporate-events",
  "party-decoration",
];

export default async function Footer() {
  const services = (await getServices()).filter((s) => FOOTER_SERVICES.includes(s.slug));
  const linkClass = "text-ivory/70 transition-colors hover:text-gold-light";

  return (
    // Extra bottom padding on mobile leaves room for the sticky contact bar
    <footer className="bg-ink pb-24 text-ivory md:pb-0">
      <div className="mx-auto max-w-7xl px-5 pt-16 md:px-8 md:pt-20">
        <div className="grid gap-12 border-b border-ivory/10 pb-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.2fr_1.4fr] lg:gap-10">
          <div>
            <Link href="/" aria-label={`${site.name} — home`} className="inline-block">
              <Wordmark size="lg" />
            </Link>
            <p className="mt-6 max-w-xs leading-relaxed text-ivory/65">
              Wedding and event décor designed around your celebration — across Kathmandu, Lalitpur and Bhaktapur.
            </p>
            <SocialLinks className="mt-7" />
          </div>

          <nav aria-labelledby="footer-explore">
            <h2 id="footer-explore" className="eyebrow !text-gold-light">
              Explore
            </h2>
            <ul className="mt-5 space-y-3">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-services">
            <h2 id="footer-services" className="eyebrow !text-gold-light">
              Services
            </h2>
            <ul className="mt-5 space-y-3">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link href={`/services#${s.slug}`} className={linkClass}>
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="eyebrow !text-gold-light">Contact</h2>
            <address className="mt-5 space-y-4 not-italic">
              <p className="flex gap-3 text-ivory/70">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold-light" strokeWidth={1.5} aria-hidden />
                {site.address.street}, {site.address.city}, {site.address.country}
              </p>
              <p className="flex gap-3">
                <Phone className="mt-0.5 size-4 shrink-0 text-gold-light" strokeWidth={1.5} aria-hidden />
                <span className="flex flex-col gap-1">
                  {site.phones.map((p) => (
                    <a key={p.e164} href={telHref(p.e164)} className={linkClass}>
                      {p.label}
                    </a>
                  ))}
                </span>
              </p>
              <p className="flex gap-3">
                <WhatsAppIcon className="mt-0.5 size-4 shrink-0 text-gold-light" />
                <a href={whatsappHref()} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  WhatsApp us
                </a>
              </p>
              <p className="flex gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-gold-light" strokeWidth={1.5} aria-hidden />
                <a href={mailHref()} className={`${linkClass} break-all`}>
                  {site.email}
                </a>
              </p>
            </address>
          </div>
        </div>

        <div className="flex flex-col gap-4 py-8 text-sm text-ivory/55 md:flex-row md:items-center md:justify-between">
          <p>&copy; {new Date().getFullYear()} {site.name}. All rights reserved.</p>
          <ul className="flex gap-6">
            {legalLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="transition-colors hover:text-ivory">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
