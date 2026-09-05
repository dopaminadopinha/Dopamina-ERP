import { Suspense } from "react";
import { OAuthConsent } from "@/components/oauth-consent";

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<main className="oauth-consent-page"><section className="oauth-consent-card">Carregando autorização…</section></main>}>
      <OAuthConsent />
    </Suspense>
  );
}
