"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "cadastro" | "recuperar";

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="input-wrap">
        <span className="input-icon">{icon}</span>
        {children}
      </div>
    </label>
  );
}

export function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage("");
    setError("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      if (mode === "recuperar") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email,
          { redirectTo: `${window.location.origin}/auth/redefinir` },
        );
        if (resetError) throw resetError;
        setMessage("Enviamos um link de recuperação para o seu e-mail.");
        return;
      }

      if (mode === "cadastro") {
        if (password.length < 8) {
          throw new Error("A senha precisa ter pelo menos 8 caracteres.");
        }
        if (password !== confirmPassword) {
          throw new Error("As senhas não coincidem.");
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          router.replace("/dashboard");
        } else {
          setMessage("Cadastro recebido. Confirme seu e-mail para liberar o acesso.");
        }
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      router.replace("/dashboard");
    } catch (submissionError) {
      const rawMessage = submissionError instanceof Error
        ? submissionError.message
        : "Não foi possível concluir a solicitação.";
      const translated = rawMessage.toLowerCase().includes("invalid login")
        ? "E-mail ou senha incorretos."
        : rawMessage;
      setError(translated);
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "login"
    ? "Acesso ao sistema"
    : mode === "cadastro"
      ? "Criar acesso"
      : "Recuperar senha";

  const subtitle = mode === "login"
    ? "Entre com suas credenciais para continuar"
    : mode === "cadastro"
      ? "Cadastre seus dados de acesso"
      : "Informe seu e-mail para receber o link";

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <div className="auth-grid" />

      <section className="brand-panel" aria-label="Dopamina ERP">
        <div className="brand-glow" />
        <div className="brand-content">
          <div className="brand-mark">
            <Image
              src="/dopamina-logo.png"
              alt="Logo do Bar Dopamina"
              width={250}
              height={232}
              priority
              unoptimized
            />
          </div>
          <p className="eyebrow"><Sparkles size={14} /> Gestão inteligente</p>
          <h1>Decisões melhores começam com dados organizados.</h1>
          <p className="brand-description">
            Vendas, CMV, estoque e despesas reunidos em um único lugar para
            transformar a rotina do Dopamina.
          </p>
          <div className="brand-points">
            <span><ShieldCheck size={16} /> Acesso restrito e seguro</span>
            <span><span className="status-dot" /> Informações centralizadas</span>
          </div>
        </div>
      </section>

      <section className="form-panel">
        <div className="auth-card">
          <div className="secure-label">
            <span className="status-dot" /> Ambiente seguro Dopamina
          </div>

          {mode !== "recuperar" ? (
            <div className="auth-tabs" role="tablist" aria-label="Acesso">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "active" : ""}
                onClick={() => switchMode("login")}
              >
                Entrar
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "cadastro"}
                className={mode === "cadastro" ? "active" : ""}
                onClick={() => switchMode("cadastro")}
              >
                Criar conta
              </button>
            </div>
          ) : null}

          <div className="auth-heading">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === "cadastro" ? (
              <Field label="Nome completo" icon={<UserRound size={17} />}>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Como devemos chamar você?"
                  autoComplete="name"
                  required
                />
              </Field>
            ) : null}

            <Field label="E-mail" icon={<Mail size={17} />}>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                required
              />
            </Field>

            {mode !== "recuperar" ? (
              <Field label="Senha" icon={<LockKeyhole size={17} />}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo de 8 caracteres"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </Field>
            ) : null}

            {mode === "cadastro" ? (
              <Field label="Confirmar senha" icon={<LockKeyhole size={17} />}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Digite a senha novamente"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>
            ) : null}

            {mode === "login" ? (
              <button
                type="button"
                className="forgot-link"
                onClick={() => switchMode("recuperar")}
              >
                Esqueci minha senha
              </button>
            ) : null}

            {error ? <p className="form-feedback error">{error}</p> : null}
            {message ? <p className="form-feedback success">{message}</p> : null}

            <button className="primary-button" type="submit" disabled={loading}>
              <span>
                {loading
                  ? "Aguarde..."
                  : mode === "login"
                    ? "Entrar"
                    : mode === "cadastro"
                      ? "Criar conta"
                      : "Enviar link"}
              </span>
              {!loading ? <ArrowRight size={18} /> : null}
            </button>

            {mode === "recuperar" ? (
              <button
                type="button"
                className="back-button"
                onClick={() => switchMode("login")}
              >
                Voltar para o login
              </button>
            ) : null}
          </form>

          <p className="access-note">
            O acesso é destinado ao proprietário e à gerência do bar.
          </p>
        </div>
      </section>

      <footer className="auth-footer">© 2026 Dopamina — Sistema de Gestão</footer>
    </main>
  );
}
