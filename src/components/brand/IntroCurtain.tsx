import Image from "next/image";
import { siteSettings } from "@/data/site";

/**
 * First-visit intro: a gold ring draws around the logo, then the screen parts like a curtain.
 * Pure CSS (see .intro in globals.css), so it always finishes — even without JavaScript.
 * The inline script marks repeat views in this tab session before first paint, which hides it.
 */
export default function IntroCurtain() {
  const logo = siteSettings.logoOnDark ?? siteSettings.logo;

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(sessionStorage.getItem('intro-seen'))document.documentElement.dataset.introSeen='1';else sessionStorage.setItem('intro-seen','1')}catch(e){document.documentElement.dataset.introSeen='1'}",
        }}
      />
      <div className="intro" aria-hidden>
        <div className="intro__panel intro__panel--top" />
        <div className="intro__panel intro__panel--bottom" />
        <div className="intro__mark">
          <svg viewBox="0 0 200 200" className="intro__ring">
            <circle cx="100" cy="100" r="96" pathLength="1" />
          </svg>
          {logo && <Image src={logo.src} alt="" width={logo.width} height={logo.height} preload className="intro__logo" />}
        </div>
      </div>
    </>
  );
}
