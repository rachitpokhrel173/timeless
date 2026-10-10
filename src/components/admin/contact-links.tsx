import { Mail, MessageCircle, Phone } from "lucide-react";
import { buttonClass } from "./ui";

/** wa.me link with a prefilled message. Opens WhatsApp; nothing is sent until the admin presses send there. */
export function whatsappLink(phone: string, message: string) {
  let digits = phone.replace(/\D/g, "");
  // Nepali mobile numbers without the country code
  if (digits.length === 10 && digits.startsWith("9")) digits = `977${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function ContactButtons({ phone, email, whatsappMessage, size = "sm" }: { phone?: string | null; email?: string | null; whatsappMessage?: string; size?: "sm" | "md" }) {
  if (!phone && !email) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={buttonClass("secondary", size)}>
          <Phone className="size-4" aria-hidden />
          Call
        </a>
      )}
      {phone && whatsappMessage && (
        <a href={whatsappLink(phone, whatsappMessage)} target="_blank" rel="noreferrer" className={buttonClass("secondary", size)}>
          <MessageCircle className="size-4" aria-hidden />
          WhatsApp
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={buttonClass("secondary", size)}>
          <Mail className="size-4" aria-hidden />
          Email
        </a>
      )}
    </div>
  );
}
