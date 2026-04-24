import Link from "next/link";
import { hasSupabaseServerEnv } from "@/lib/supabase";

export default function HomePage() {
  const hasServerEnv = hasSupabaseServerEnv();

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Workout Web / Next.js</span>
        <h1>迁移工作台已经就位</h1>
        <p>
          这一版先把训练页的数据读取迁进 Next.js App Router，Vercel 后续只需要把
          Root Directory 指向 <code>frontend</code>，再把 Framework 设成
          <code>Next.js</code>。
        </p>
      </section>

      <section className="grid two">
        <article className="panel">
          <div className="panel-body">
            <h2>当前交付</h2>
            <div className="remark-list">
              <div className="exercise-item">
                <div className="exercise-name">训练页首屏</div>
                <div className="exercise-meta">今天计划、当前训练状态、当日负荷已经由 Next.js 读取。</div>
              </div>
              <div className="exercise-item">
                <div className="exercise-name">前端数据层</div>
                <div className="exercise-meta">
                  Supabase 查询、计划解析和训练状态计算已经搬进 TypeScript。
                </div>
              </div>
              <div className="exercise-item">
                <div className="exercise-name">Vercel 切换路径</div>
                <div className="exercise-meta">
                  当前仓库继续保留 Flask，切流时只需要让 Vercel 指向
                  <code>frontend</code>。
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-body">
            <h2>下一步入口</h2>
            <div className="remark-list">
              <Link href="/training" className="exercise-item">
                <div className="exercise-name">打开新训练页</div>
                <div className="exercise-meta">先看当前计划、训练状态和当日负荷。</div>
              </Link>
              <div className="exercise-item">
                <div className="exercise-name">环境状态</div>
                <div className="exercise-meta">
                  {hasServerEnv ? "Supabase 服务端变量已经可读。" : "需要补齐 frontend 环境变量后再取数。"}
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
