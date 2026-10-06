import { Phone } from "lucide-react";
import { siteSettings } from "@/data/site";
import { WhatsAppIcon } from "@/components/ui/BrandIcons";
import { telHref, whatsappHref } from "@/lib/utils";

export default function AnnouncementBar() {
  return (
    <div className="bg-ink text-[0.7rem] tracking-[0.14em] text-ivory/80 uppercase">
      <div className="mx-auto flex h-8 max-w-7xl items-center justify-center px-5 md:h-9 md:justify-between md:px-8">
        <p className="truncate">{siteSettings.announcement}</p>
        <div className="hidden items-center gap-6 md:flex">
          <a href={telHref()} className="flex items-center gap-2 transition-colors hover:text-gold-light">
            <Phone className="size-3.5" strokeWidth={1.5} aria-hidden />
            Call {siteSettings.phones[0].label}
          </a>
          <a
            href={whatsappHref()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-gold-light"
          >
            <WhatsAppIcon className="size-3.5" />
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
