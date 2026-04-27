"use client";

import { FormEvent, useState } from "react";

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next: nextPath }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "登录失败");
      }
      window.location.assign(payload.next || nextPath || "/");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submitLogin}>
      <label>
        访问密码
        <input
          autoComplete="current-password"
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="输入密码"
        />
      </label>
      {error ? <div className="feedback error">{error}</div> : null}
      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting ? "验证中..." : "登录"}
      </button>
    </form>
  );
}
