import { ShieldCheck } from "lucide-react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

function readNextPath(value: SearchParamValue): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const params = searchParams ? await searchParams : {};
  const nextPath = readNextPath(params.next);

  return (
    <main className="login-shell">
      <section className="surface login-card">
        <div className="login-mark">
          <ShieldCheck size={32} />
        </div>
        <span className="kicker">Private Access</span>
        <h1>训练记录访问验证</h1>
        <p>输入访问密码后继续使用训练计划、记录和负荷监控。</p>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
