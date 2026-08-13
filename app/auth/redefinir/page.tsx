"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess("Senha atualizada com sucesso. Você já pode entrar no sistema.");
    await supabase.auth.signOut();
    window.setTimeout(() => router.replace("/"), 1800);
  }

  return (
    <main className="reset-page">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-grid" />
      <section className="reset-card">
        <Image src="/dopamina-logo.png" alt="Dopamina" width={104} height={96} unoptimized />
        <div className="secure-label"><span className="status-dot" /> Recuperação segura</div>
        <h1>Crie uma nova senha</h1>
        <p>Escolha uma senha forte e diferente das que você já utiliza.</p>
        {!ready ? (
          <div className="form-feedback error">Este link expirou ou não é válido. Solicite um novo link na tela de login.</div>
        ) : (
          <form onSubmit={updatePassword}>
            <label className="auth-field">
              <span>Nova senha</span>
              <div className="input-wrap">
                <span className="input-icon"><LockKeyhole size={17} /></span>
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label="Mostrar ou ocultar senha">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <label className="auth-field">
              <span>Confirmar nova senha</span>
              <div className="input-wrap">
                <span className="input-icon"><LockKeyhole size={17} /></span>
                <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
              </div>
            </label>
            {error ? <div className="form-feedback error">{error}</div> : null}
            {success ? <div className="form-feedback success">{success}</div> : null}
            <button className="primary-button" type="submit" disabled={loading}>
              <span>{loading ? "Atualizando..." : "Atualizar senha"}</span>
              {!loading ? <ArrowRight size={18} /> : null}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
