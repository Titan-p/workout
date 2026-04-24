import Link from "next/link";
import { Terminal, CalendarDays } from "lucide-react";

export default function UploadPage() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="kicker">Sync</div>
          <h1>训练计划同步</h1>
        </div>
        <Link className="ghost-button" href="/week">
          <CalendarDays size={17} />
          周视图
        </Link>
      </header>

      <section className="surface">
        <div className="section-head">
          <div>
            <span className="kicker">Local Script</span>
            <h2>本地解析上传</h2>
          </div>
          <Terminal size={22} />
        </div>
        <pre className="command-block">python3 scripts/upload_workout_plans.py --env-file .env</pre>
      </section>
    </main>
  );
}
