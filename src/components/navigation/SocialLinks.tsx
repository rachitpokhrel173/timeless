import { socialIcons } from "@/components/ui/BrandIcons";
import { activeSocials, cn } from "@/lib/utils";

/** Round icon links for every social profile that has a URL configured. */
export default function SocialLinks({ className }: { className?: string }) {
  const socials = activeSocials();
  if (socials.length === 0) return null;

  return (
    <ul className={cn("flex gap-3", className)}>
      {socials.map((s) => {
        const Icon = socialIcons[s.platform];
        return (
          <li key={s.platform}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${s.label} (opens in a new tab)`}
              className="flex size-11 items-center justify-center rounded-full border border-current/25 transition-colors hover:border-gold hover:text-gold"
            >
              <Icon className="size-[18px]" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
