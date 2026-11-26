"use client";
// components/staff/ReStaffLoginPage.tsx — the RE team sign-in (owner-supplied bundle, adapted to design tokens).
// Auth is wired by components/staff/StaffSignIn.tsx; the console still requires an authenticator code (lib/auth/platform.ts).

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import "./re-staff-login.css";

const PILLARS = [
  { value: "42", label: "Builders", height: 82, bg: "linear-gradient(180deg, #38BDF8 0%, #0284C7 100%)", msg: "42 real estate developers & agencies live on RE — 4 more launching this week!" },
  { value: "684", label: "Active Reps", height: 106, bg: "linear-gradient(180deg, #6366F1 0%, #4338CA 100%)", msg: "684 sales reps & channel partners actively closing deals inside RE every day." },
  { value: "4.8K", label: "Site Visits", height: 132, bg: "linear-gradient(180deg, #34D399 0%, #059669 100%)", msg: "4,820 buyer site visits powered through RE this month — new team record!" },
  { value: "94%", label: "Fast SLA", height: 98, bg: "linear-gradient(180deg, #FBBF24 0%, #D97706 100%)", msg: "94% of buyer enquiries answered under 5 minutes thanks to your onboarding setup." },
];

const TEAM_WINS = [
  { tag: "Go-live win", tone: "bg-success-bg text-success border-success/20", meta: "Today", text: "Skyview Developers went live — 28 sales reps onboarded smoothly" },
  { tag: "Speed record", tone: "bg-brand-light text-brand border-brand/20", meta: "This week", text: "Avg buyer response time hit 2 min 28 s across active towers" },
  { tag: "Partner love", tone: "bg-info-bg text-info border-info/20", meta: "Yesterday", text: "Crest Channel Partners closed 6 unit bookings using RE" },
  { tag: "Today's focus", tone: "bg-warning-bg text-warning border-warning/25", meta: "Up next", text: "3 builder product demos scheduled · 2 CRM migrations ready" },
];

export interface ReStaffLoginPageProps {
  /** Wire to your existing Supabase internal staff sign-in handler */
  onStaffSignIn?: (email: string, password: string) => Promise<void> | void;
  customerLoginHref?: string;
  helpHref?: string;
}

export default function ReStaffLoginPage({
  onStaffSignIn,
  customerLoginHref = "/login",
  helpHref = "/forgot-password",
}: ReStaffLoginPageProps) {
  const gradId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activePillar, setActivePillar] = useState(2);
  const [activeWin, setActiveWin] = useState(0);

  const cardRef = useRef<HTMLElement | null>(null);
  const logoRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);

  const isTyping = useRef(false);
  const cardTarget = useRef({ rx: 0, ry: 0 });
  const cardCur = useRef({ rx: 0, ry: 0 });
  const stageHover = useRef(false);
  const deckTarget = useRef({ rx: 0, ry: 0 });
  const deckCur = useRef({ rx: 0, ry: 0 });

  const hasAt = email.includes("@");
  const isPxStaff = email.trim().toLowerCase().endsWith("@productionx.in");

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      cardCur.current.rx += (cardTarget.current.rx - cardCur.current.rx) * 0.1;
      cardCur.current.ry += (cardTarget.current.ry - cardCur.current.ry) * 0.1;
      if (cardRef.current) {
        cardRef.current.style.transform = `rotateX(${cardCur.current.rx.toFixed(2)}deg) rotateY(${cardCur.current.ry.toFixed(2)}deg)`;
      }

      const idleRx = stageHover.current ? 0 : Math.sin(t * 0.9) * 2.0;
      const idleRy = stageHover.current ? 0 : Math.cos(t * 0.7) * 5.0;
      deckCur.current.rx += (deckTarget.current.rx + idleRx - deckCur.current.rx) * 0.09;
      deckCur.current.ry += (deckTarget.current.ry + idleRy - deckCur.current.ry) * 0.09;
      if (deckRef.current) {
        deckRef.current.style.transform = `rotateX(${(8 + deckCur.current.rx).toFixed(2)}deg) rotateY(${deckCur.current.ry.toFixed(2)}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const updateCard = (cx: number, cy: number) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((cx - r.left) / r.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((cy - r.top) / r.height) * 2 - 1));
    el.style.setProperty("--card-x", `${(((nx + 1) / 2) * 100).toFixed(1)}%`);
    el.style.setProperty("--card-y", `${(((ny + 1) / 2) * 100).toFixed(1)}%`);
    if (!isTyping.current) cardTarget.current = { rx: -ny * 1.8, ry: nx * 2.0 };
    if (logoRef.current) logoRef.current.style.transform = `translate3d(${(nx * 4.5).toFixed(1)}px, ${(ny * 3.5).toFixed(1)}px, 0)`;
  };

  const resetCard = () => {
    cardTarget.current = { rx: 0, ry: 0 };
    if (logoRef.current) logoRef.current.style.transform = "translate3d(0,0,0)";
  };

  const updateStage = (cx: number, cy: number) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((cx - r.left) / r.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((cy - r.top) / r.height) * 2 - 1));
    deckTarget.current = { rx: -ny * 7, ry: nx * 12 };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Enter your team email and password to sign in.");
      return;
    }
    try {
      setSubmitting(true);
      if (onStaffSignIn) await onStaffSignIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] text-[#1E1B4B] flex flex-col">
      <div className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-stretch">
        {/* LEFT COLUMN: Bright Welcoming Staff Sign-In */}
        <div className="lg:col-span-5 flex flex-col justify-between py-1">
          <div className="flex items-center justify-between">
            <Link href={customerLoginHref} className="inline-flex items-center gap-1.5 min-h-[36px] text-xs font-medium text-muted hover:text-[#1E1B4B] transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              <span>Customer portal</span>
            </Link>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-light border border-brand/20 text-[10px] font-semibold uppercase tracking-wider text-[#4338CA]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4338CA]" /> PX Team Portal
            </span>
          </div>

          <div className="my-5 sm:my-7 w-full max-w-[420px] mx-auto re-staff-scene">
            <div className="flex flex-col items-center gap-2 mb-5">
              <div ref={logoRef} className="w-12 h-12 rounded-[14px] shadow-[0_10px_24px_-6px_rgba(67,56,202,0.48)] transition-transform duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-full h-full" role="img" aria-label="RE Team">
                  <defs>
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#5348F5" />
                      <stop offset="52%" stopColor="#4338CA" />
                      <stop offset="100%" stopColor="#2E268A" />
                    </linearGradient>
                  </defs>
                  <rect width="512" height="512" rx="118" fill={`url(#${gradId})`} />
                  <path fill="#FFFFFF" fillRule="evenodd" d="M92 154 H188 C224 154 246 176 246 210 C246 237 230 257 205 264 L256 358 H206 L160 270 H136 V358 H92 Z M136 194 V232 H184 C198 232 206 224 206 213 C206 202 198 194 184 194 Z" />
                  <path fill="rgba(49,46,129,0.22)" d="M160 270 H205 L219 296 H173 Z" />
                  <path fill="#FFFFFF" d="M276 154 H416 V194 H316 V236 H400 V276 H316 V318 H416 V358 H278 L254 316 V196 Z" />
                  <path fill="rgba(49,46,129,0.22)" d="M276 154 H316 L276 200 L254 196 Z" />
                </svg>
              </div>
              <span className="text-[11px] font-semibold text-[#4338CA]/90">Production X · Internal Team</span>
            </div>

            <section
              ref={cardRef}
              onMouseMove={(e) => updateCard(e.clientX, e.clientY)}
              onMouseLeave={resetCard}
              onTouchStart={(e) => { cardRef.current?.classList.add("is-touching"); if (e.touches[0]) updateCard(e.touches[0].clientX, e.touches[0].clientY); }}
              onTouchMove={(e) => { if (e.touches[0]) updateCard(e.touches[0].clientX, e.touches[0].clientY); }}
              onTouchEnd={() => { cardRef.current?.classList.remove("is-touching"); resetCard(); }}
              onFocus={() => { isTyping.current = true; cardTarget.current = { rx: 0, ry: 0 }; }}
              onBlur={() => { isTyping.current = false; }}
              className="re-staff-card rounded-[24px] p-6 sm:p-8"
            >
              <div className="re-staff-sheen" />
              <div className="relative space-y-5">
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-[#1E1B4B]">Welcome back, team</h1>
                  <p className="text-sm text-muted mt-1.5 leading-relaxed">
                    Sign in to launch new builders, support live sales teams, and keep every workspace flying.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="re-team-email" className="block text-xs font-semibold text-foreground">Team Email</label>
                      {hasAt && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          isPxStaff
                            ? "bg-success-bg text-success border-success/20"
                            : "bg-warning-bg text-warning border-warning/25"
                        }`}>
                          {isPxStaff ? "Welcome, PX Team" : "Use @productionx.in"}
                        </span>
                      )}
                    </div>
                    <input
                      id="re-team-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@productionx.in"
                      autoComplete="email"
                      className="re-staff-input w-full px-3.5 py-2.5 text-sm text-[#1E1B4B] placeholder:text-subtle"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="re-team-pw" className="block text-xs font-semibold text-foreground">Password</label>
                      <Link href={helpHref} className="text-xs font-semibold text-[#4338CA] hover:text-[#3730A3] transition-colors">Need help?</Link>
                    </div>
                    <div className="relative">
                      <input
                        id="re-team-pw"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="re-staff-input w-full px-3.5 py-2.5 pr-11 text-sm text-[#1E1B4B] placeholder:text-subtle"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label="Toggle password visibility"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-subtle hover:text-[#4338CA] transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="text-xs font-medium text-danger bg-danger-bg border border-danger/25 rounded-xl px-3.5 py-2.5">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={submitting} className="re-staff-btn w-full rounded-[12px] text-sm font-semibold text-[#fff] flex items-center justify-center gap-2 disabled:opacity-70">
                    <span>{submitting ? "Opening console..." : "Let's get to work"}</span>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </button>
                </form>

                <div className="pt-4 border-t border-default flex items-center justify-between text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--chart-2)]" />
                    All RE workspaces healthy
                  </span>
                  <span className="font-semibold text-[#4338CA]">One team · One mission</span>
                </div>
              </div>
            </section>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted">
              <img
                src="/brand/px-mark-mono-ink.svg"
                alt=""
                className="h-3.5 w-auto opacity-65"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <span>Built with pride by <strong className="font-semibold text-[#1E1B4B]/80">Production X</strong></span>
            </div>
          </div>

          <div className="hidden lg:block h-4" />
        </div>

        {/* RIGHT COLUMN: Uplifting Team Momentum & 3D Growth Pillars */}
        <aside
          ref={stageRef}
          onMouseMove={(e) => { stageHover.current = true; updateStage(e.clientX, e.clientY); }}
          onMouseLeave={() => { stageHover.current = false; deckTarget.current = { rx: 0, ry: 0 }; }}
          onTouchStart={(e) => { stageHover.current = true; if (e.touches[0]) updateStage(e.touches[0].clientX, e.touches[0].clientY); }}
          onTouchMove={(e) => { if (e.touches[0]) updateStage(e.touches[0].clientX, e.touches[0].clientY); }}
          onTouchEnd={() => { stageHover.current = false; deckTarget.current = { rx: 0, ry: 0 }; }}
          className="lg:col-span-7 re-momentum-stage rounded-[32px] p-5 sm:p-7 flex flex-col justify-between gap-4 relative overflow-hidden"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1E1B4B] leading-tight">
                Building India&apos;s fastest real estate OS.
              </h2>
              <p className="text-xs sm:text-sm text-muted mt-0.5">
                Every builder we launch and every lead we save makes a real difference today.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-surface/90 border border-[rgb(255_255_255)] shadow-sm rounded-full px-3 py-1 text-[11px] font-semibold text-success shrink-0">
              <span className="w-2 h-2 rounded-full bg-[var(--chart-2)] animate-pulse" />
              <span>Team Momentum High</span>
            </div>
          </div>

          {/* 3D Rising Team Growth Pillars */}
          <div className="re-team-glass rounded-[22px] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#4338CA]">Our Impact This Month</div>
                <div className="font-bold text-base text-[#1E1B4B]">84% of Monthly Launch Target</div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-success-bg text-success border border-success/20 text-[11px] font-semibold">
                +26% vs last month
              </span>
            </div>

            <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
              <div className="h-full rounded-full re-goal-bar" style={{ width: "84%" }} />
            </div>

            <div className="re-pillar-stage">
              <div ref={deckRef} className="re-pillar-deck">
                {PILLARS.map((p, idx) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setActivePillar(idx)}
                    style={{ height: `${p.height}px`, background: p.bg }}
                    className={`re-pillar-bar ${activePillar === idx ? "is-active" : ""}`}
                  >
                    <span className="text-xs font-extrabold">{p.value}</span>
                    <span className="text-[9px] font-semibold opacity-95">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface-muted/95 border border-default rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#1E1B4B]">{PILLARS[activePillar].msg}</span>
              <span className="text-[10px] font-semibold text-[#4338CA] shrink-0">Tap bars</span>
            </div>
          </div>

          {/* Recent Wins & Today's Focus */}
          <div className="re-team-glass rounded-[22px] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4338CA]">Team Pulse</div>
                <div className="font-bold text-sm sm:text-base text-[#1E1B4B]">Recent Wins &amp; Today&apos;s Focus</div>
              </div>
              <span className="text-[11px] font-medium text-muted">Hyderabad HQ</span>
            </div>

            <div className="space-y-2">
              {TEAM_WINS.map((w, idx) => (
                <button
                  key={w.tag}
                  type="button"
                  onClick={() => setActiveWin(idx)}
                  className={`w-full text-left flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl border transition-all ${
                    activeWin === idx
                      ? "bg-brand-light/55 border-brand/20 shadow-sm translate-x-1"
                      : "bg-surface/80 border-default hover:bg-surface"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${w.tone}`}>{w.tag}</span>
                    <span className="text-xs font-medium text-[#1E1B4B] truncate">{w.text}</span>
                  </div>
                  <span className="text-[10px] font-medium text-subtle shrink-0">{w.meta}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-muted flex-wrap">
            <span>Need support? Ping <strong className="text-[#1E1B4B]">#re-ops-team</strong> anytime.</span>
            <span className="font-semibold text-success">Let&apos;s make today count.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
