import { Fragment } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders content strings from the data layer: "\n" becomes a line break and "*word*"
 * becomes italic burgundy — so editors can style headings without touching components.
 */
export default function Rich({ text, emClassName }: { text: string; emClassName?: string }) {
  return text.split("\n").map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith("*") && part.endsWith("*") ? (
          <em key={i} className={cn("italic text-burgundy", emClassName)}>
            {part.slice(1, -1)}
          </em>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </Fragment>
  ));
}
