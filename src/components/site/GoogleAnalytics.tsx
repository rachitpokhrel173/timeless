import Script from "next/script";

/** Google Analytics 4 measurement ID (Google Analytics → Admin → Data streams). */
const GA_ID = "G-CFM7XDY6R6";

/**
 * Google tag for the public website. Not loaded in development, so local testing doesn't count as
 * visits, and not on the admin or client portal. Client-side page changes are recorded by GA4's
 * enhanced measurement ("page changes based on browser history events", on by default).
 */
export default function GoogleAnalytics() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
    </>
  );
}
