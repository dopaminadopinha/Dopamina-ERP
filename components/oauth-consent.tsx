"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, LockKeyhole, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AuthorizationDetails = {
  authorization_id: string;
  client: { name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

export function OAuthConsent() {
  const searchParams = useSearchParams();
  const authorizationId = searchParams.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadAuthorization = useCallback(async () => {
    if (!authorizationId) {
      setError("Solicitação de autorização inválida ou incompleta.");
      setLoading(false);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setNeedsLogin(true);
      setLoading(false);
      return;
    }
    const { data: membership } = await supabase.from("business_members").select("business_id").eq("user_id", sessionData.session.user.id).eq("status", "active").limit(1).maybeSingle();
    if (!membership) {
      setError("Sua conta ainda não possui acesso ativo ao Dopamina ERP.");
      setLoading(false);
      return;
    }
    const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (detailsError || !data) {
      setError(detailsError?.message || "Não foi possível carregar esta autorização.");
      setLoading(false);
      return;
    }
    if ("redirect_url" in data) {
      window.location.assign(data.redirect_url);
      return;
    }
    setDetails(data as AuthorizationDetails);
    setNeedsLogin(false);
    setLoading(false);
  }, [authorizationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAuthorization(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAuthorization]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError("E-mail ou senha incorretos.");
      setSubmitting(false);
      return;
    }
    await loadAuthorization();
    setSubmitting(false);
  }

  async function decide(approved: boolean) {
    setSubmitting(true);
    setError("");
    const response = approved
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (response.error || !response.data) {
      setError(response.error?.message || "Não foi possível concluir a autorização.");
      setSubmitting(false);
      return;
    }
    window.location.assign(response.data.redirect_url);
  }

  return (
    <main className="oauth-consent-page">
      <section className="oauth-consent-card">
        <div className="oauth-consent-brand"><Image src="/dopamina-tatu-192.png" alt="Dopamina" width={54} height={54} /><div><strong>Dopamina ERP</strong><span>Conexão segura</span></div></div>
        {loading ? <p className="oauth-consent-state">Carregando autorização…</p> : null}
        {!loading && needsLogin ? (
          <>
            <div className="oauth-consent-heading"><LockKeyhole size={20} /><div><h1>Entre para autorizar</h1><p>Use a mesma conta cadastrada no ERP.</p></div></div>
            <form className="oauth-consent-form" onSubmit={signIn}>
              <label><span>E-mail</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label><span>Senha</span><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {error ? <p className="oauth-consent-error">{error}</p> : null}
              <button className="oauth-consent-primary" disabled={submitting}>{submitting ? "Entrando…" : "Entrar"}</button>
            </form>
          </>
        ) : null}
        {!loading && details ? (
          <>
            <div className="oauth-consent-heading"><LockKeyhole size={20} /><div><h1>Autorizar conexão</h1><p><strong>{details.client.name || "Claude"}</strong> quer acessar o Dopamina ERP.</p></div></div>
            <div className="oauth-consent-permissions">
              <p>O conector poderá:</p>
              <div><Check size={15} /><span>Consultar produtos, saldo e movimentações</span></div>
              <div><Check size={15} /><span>Validar notas e apontar dados ausentes</span></div>
              <div><Check size={15} /><span>Registrar compras e operações somente após sua confirmação</span></div>
            </div>
            <p className="oauth-consent-user">Conectando como <strong>{details.user.email}</strong></p>
            {error ? <p className="oauth-consent-error">{error}</p> : null}
            <div className="oauth-consent-actions">
              <button className="oauth-consent-secondary" disabled={submitting} onClick={() => decide(false)}><X size={15} />Cancelar</button>
              <button className="oauth-consent-primary" disabled={submitting} onClick={() => decide(true)}><Check size={15} />{submitting ? "Autorizando…" : "Autorizar"}</button>
            </div>
          </>
        ) : null}
        {!loading && !needsLogin && !details && error ? <p className="oauth-consent-error standalone">{error}</p> : null}
      </section>
    </main>
  );
}
