import { cn } from "@/lib/utils";

/** Text logo. Swap for an <Image> once the client supplies a logo file. */
export default function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className={cn("font-serif font-medium tracking-[0.01em]", size === "lg" ? "text-[2rem]" : "text-[1.55rem] md:text-[1.7rem]")}>
        Timeless <em className="font-normal">Tie</em>
      </span>
      <span className="mt-1 text-[0.58rem] tracking-[0.42em] uppercase opacity-75">Events Décor</span>
    </span>
  );
}
