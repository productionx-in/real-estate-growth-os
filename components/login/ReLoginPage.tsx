"use client";
// components/login/ReLoginPage.tsx — the RE sign-in page (owner-supplied bundle, adapted: design tokens instead of raw
// palette classes, OTP tab only when OTP sign-in is wired, notice slot). Auth is wired by components/login/CustomerSignIn.tsx.

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import "./re-login.css";

type AuthMode = "password" | "otp";
type Typology = "apartments" | "plots";

interface UnitSpec {
  code: string;
  label: string;
  colorClass: string;
  detail: string;
}

interface FloorSpec {
  level: number;
  name: string;
  units: UnitSpec[];
}

const FLOORS: FloorSpec[] = [
  {
    level: 0,
    name: "Floor 08",
    units: [
      { code: "A-0801", label: "801", colorClass: "bg-[var(--chart-2)]/90", detail: "Unit A-0801 · 2 BHK · Open for Booking" },
      { code: "A-0802", label: "802", colorClass: "bg-[#4338CA]/95", detail: "Unit A-0802 · 2 BHK · Booked via Partner" },
      { code: "A-0803", label: "803", colorClass: "bg-[var(--chart-2)]/90", detail: "Unit A-0803 · 2 BHK · Open for Booking" },
      { code: "A-0804", label: "804", colorClass: "bg-[var(--chart-3)]/90", detail: "Unit A-0804 · 2 BHK · 24h Token Hold" },
      { code: "A-0805", label: "805", colorClass: "bg-[#4338CA]/95", detail: "Unit A-0805 · 2 BHK · Booked" },
      { code: "A-0806", label: "806", colorClass: "bg-[var(--chart-4)]/90", detail: "Unit A-0806 · 2 BHK · Site Visit Today 4 PM" },
    ],
  },
  {
    level: 1,
    name: "Floor 12",
    units: [
      { code: "A-1201", label: "1201", colorClass: "bg-[#4338CA]/95", detail: "Unit A-1201 · 3 BHK · Booked" },
      { code: "A-1202", label: "1202", colorClass: "bg-[var(--chart-4)]/90", detail: "Unit A-1202 · 3 BHK · Site Visit Scheduled" },
      { code: "A-1203", label: "1203", colorClass: "bg-[var(--chart-2)]/90", detail: "Unit A-1203 · 3 BHK · Open for Booking" },
      { code: "A-1204", label: "1204", colorClass: "bg-[var(--chart-2)]/90", detail: "Unit A-1204 · 3 BHK East · Open" },
      { code: "A-1205", label: "1205", colorClass: "bg-[var(--chart-3)]/90", detail: "Unit A-1205 · 3 BHK · Partner Hold" },
      { code: "A-1206", label: "1206", colorClass: "bg-[#4338CA]/95", detail: "Unit A-1206 · 3 BHK Corner · Booked" },
    ],
  },
  {
    level: 2,
    name: "Floor 14",
    units: [
      { code: "A-1401", label: "1401", colorClass: "bg-[#4338CA]/95", detail: "Unit A-1401 · 3 BHK · Booked via Direct Sales" },
      { code: "A-1402", label: "1402", colorClass: "bg-[var(--chart-2)]/90", detail: "Unit A-1402 · 3 BHK · 1,850 sq.ft · Open" },
      { code: "A-1403", label: "1403", colorClass: "bg-[var(--chart-4)]/90", detail: "Unit A-1403 · 3 BHK · Confirmed Saturday 11:00 AM" },
      { code: "A-1404", label: "1404", colorClass: "bg-[var(--chart-2)]/90", detail: "Unit A-1404 · 3 BHK · Open for Booking" },
      { code: "A-1405", label: "1405", colorClass: "bg-[#4338CA]/95", detail: "Unit A-1405 · 3 BHK Corner · Booked" },
      { code: "A-1406", label: "1406", colorClass: "bg-[var(--chart-3)]/90", detail: "Unit A-1406 · 3 BHK · 24h Token Hold" },
    ],
  },
];

const PLOTS: UnitSpec[] = [
  { code: "P-101", label: "101", colorClass: "bg-[#4338CA]/95", detail: "Plot P-101 · 300 sq.yd East Corner · Booked" },
  { code: "P-102", label: "102", colorClass: "bg-[var(--chart-2)]/90", detail: "Plot P-102 · 267 sq.yd East · Open for Booking" },
  { code: "P-103", label: "103", colorClass: "bg-[var(--chart-4)]/90", detail: "Plot P-103 · 267 sq.yd · Site Visit Sat 11 AM" },
  { code: "P-104", label: "104", colorClass: "bg-[#4338CA]/95", detail: "Plot P-104 · 300 sq.yd North-East · Booked" },
  { code: "P-105", label: "105", colorClass: "bg-[var(--chart-3)]/90", detail: "Plot P-105 · 240 sq.yd West · Partner Hold" },
  { code: "P-106", label: "106", colorClass: "bg-[var(--chart-2)]/90", detail: "Plot P-106 · 240 sq.yd West · Open" },
  { code: "P-107", label: "107", colorClass: "bg-[#4338CA]/95", detail: "Plot P-107 · 240 sq.yd West · Booked" },
  { code: "P-108", label: "108", colorClass: "bg-[var(--chart-2)]/90", detail: "Plot P-108 · 280 sq.yd Corner · Open" },
];

const TIMELINE_STEPS = [
  { tag: "Captured", tone: "bg-brand-light text-brand border-brand/20/80", time: "10:42:03", text: "Meta lead form · Rohan Iyer · 3 BHK" },
  { tag: "Routed", tone: "bg-info-bg text-info border-info/20/80", time: "10:42:04", text: "Assigned to Asha (Towers Desk)" },
  { tag: "Instant alert", tone: "bg-warning-bg text-warning border-warning/25/80", time: "10:42:05", text: "WhatsApp & call trigger delivered" },
  { tag: "Site visit booked", tone: "bg-success-bg text-success border-success/20/80", time: "10:44:31", text: "Unit A-1403 · Confirmed Saturday 11:00 AM" },
];

export interface ReLoginPageProps {
  /** Wire to your existing Supabase / NextAuth password sign-in handler */
  onPasswordSignIn?: (email: string, password: string) => Promise<void> | void;
  /** Optional OTP sign-in handler */
  onOtpSignIn?: (identifier: string, code: string) => Promise<void> | void;
  /** Optional forgot password link or callback */
  forgotPasswordHref?: string;
  demoHref?: string;
  homeHref?: string;
  /** Shown above the form (e.g. an expired e-mail link). */
  notice?: React.ReactNode;
}

export default function ReLoginPage({
  onPasswordSignIn,
  onOtpSignIn,
  forgotPasswordHref = "/forgot-password",
  demoHref = "/#book-demo",
  homeHref = "/",
  notice,
}: ReLoginPageProps) {
  const gradId = useId();

  // Auth form state
  const [authMode, setAuthMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Showcase state
  const [typology, setTypology] = useState<Typology>("apartments");
  const [activeFloor, setActiveFloor] = useState<number>(2);
  const [activeUnitCode, setActiveUnitCode] = useState<string>("A-1403");
  const [selectedDetail, setSelectedDetail] = useState<string>(
    "Unit A-1403 · 3 BHK · Confirmed Saturday 11:00 AM"
  );
  const [activeStep, setActiveStep] = useState<number>(3);

  // Refs for smooth 60fps 3D spring loops (zero React re-renders per frame)
  const signinCardRef = useRef<HTMLElement | null>(null);
  const magLogoRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const towerRef = useRef<HTMLDivElement | null>(null);
  const plotsRef = useRef<HTMLDivElement | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isTypingRef = useRef(false);
  const cardTarget = useRef({ rx: 0, ry: 0 });
  const cardCur = useRef({ rx: 0, ry: 0 });
  const stageInteracting = useRef(false);
  const stageTarget = useRef({ rx: 0, ry: 0 });
  const stageCur = useRef({ rx: 0, ry: 0 });

  const workspaceReady = email.includes("@") && (email.split("@")[1]?.includes(".") ?? false);

  useEffect(() => {
    let rafId = 0;
    const startTs = performance.now();

    const tick = (now: number) => {
      const t = (now - startTs) / 1000;

      // 1. Left sign-in card whisper-light 2deg spring (flattens to 0deg while typing)
      cardCur.current.rx += (cardTarget.current.rx - cardCur.current.rx) * 0.1;
      cardCur.current.ry += (cardTarget.current.ry - cardCur.current.ry) * 0.1;
      if (signinCardRef.current) {
        signinCardRef.current.style.transform = `rotateX(${cardCur.current.rx.toFixed(2)}deg) rotateY(${cardCur.current.ry.toFixed(2)}deg)`;
      }

      // 2. Right 3D isometric tower / plots living breath + orbit
      const idleRx = stageInteracting.current ? 0 : Math.sin(t * 0.9) * 2.2;
      const idleRy = stageInteracting.current ? 0 : Math.cos(t * 0.7) * 4.5;
      const idleFloat = Math.sin(t * 1.4) * 3.0;

      stageCur.current.rx += (stageTarget.current.rx + idleRx - stageCur.current.rx) * 0.09;
      stageCur.current.ry += (stageTarget.current.ry + idleRy - stageCur.current.ry) * 0.09;

      if (towerRef.current) {
        towerRef.current.style.transform = `translateY(${idleFloat.toFixed(2)}px) rotateX(${(56 + stageCur.current.rx).toFixed(2)}deg) rotateZ(${(-36 + stageCur.current.ry).toFixed(2)}deg)`;
      }
      if (plotsRef.current) {
        plotsRef.current.style.transform = `translateY(${idleFloat.toFixed(2)}px) rotateX(${(54 + stageCur.current.rx).toFixed(2)}deg) rotateZ(${(-32 + stageCur.current.ry).toFixed(2)}deg)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const updateCardPointer = (clientX: number, clientY: number) => {
    const el = signinCardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
    el.style.setProperty("--card-x", `${(((nx + 1) / 2) * 100).toFixed(1)}%`);
    el.style.setProperty("--card-y", `${(((ny + 1) / 2) * 100).toFixed(1)}%`);
    if (!isTypingRef.current) {
      cardTarget.current = { rx: -ny * 1.8, ry: nx * 2.0 };
    }
    if (magLogoRef.current) {
      magLogoRef.current.style.transform = `translate3d(${(nx * 4.5).toFixed(1)}px, ${(ny * 3.5).toFixed(1)}px, 0)`;
    }
  };

  const resetCardPointer = () => {
    cardTarget.current = { rx: 0, ry: 0 };
    if (magLogoRef.current) {
      magLogoRef.current.style.transform = "translate3d(0, 0, 0)";
    }
  };

  const updateStagePointer = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
    stageTarget.current = { rx: -ny * 8, ry: nx * 13 };
    el.style.setProperty("--sheen-x", `${(((nx + 1) / 2) * 100).toFixed(1)}%`);
    el.style.setProperty("--sheen-y", `${(((ny + 1) / 2) * 100).toFixed(1)}%`);
  };

  const handleOtpChange = (idx: number, val: string) => {
    const clean = val.replace(/[^0-9]/g, "").slice(0, 1);
    const next = [...otp];
    next[idx] = clean;
    setOtp(next);
    if (clean && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter your work email to sign in.");
      return;
    }
    if (authMode === "password" && !password.trim()) {
      setError("Enter your password to sign in.");
      return;
    }
    if (authMode === "otp" && otp.some((d) => !d)) {
      setError("Enter all 6 digits of your sign-in code.");
      return;
    }

    try {
      setSubmitting(true);
      if (authMode === "password" && onPasswordSignIn) {
        await onPasswordSignIn(email.trim(), password);
      } else if (authMode === "otp" && onOtpSignIn) {
        await onOtpSignIn(email.trim(), otp.join(""));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in. Check your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] text-[#1E1B4B] flex flex-col">
      <div className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-stretch">
        {/* LEFT COLUMN: Unified Sign-In Panel */}
        <div className="lg:col-span-5 flex flex-col justify-between py-1">
          <div>
            <Link
              href={homeHref}
              className="inline-flex items-center gap-1.5 min-h-[36px] text-xs font-medium text-muted hover:text-[#1E1B4B] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              <span>Back to home</span>
            </Link>
          </div>

          <div className="my-5 sm:my-7 w-full max-w-[420px] mx-auto re-signin-scene">
            {/* Pure RE Electric Indigo Squircle */}
            <div className="flex justify-center mb-5">
              <div
                ref={magLogoRef}
                className="re-magnetic-logo w-12 h-12 rounded-[14px] shadow-[0_10px_24px_-6px_rgba(67,56,202,0.48)]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-full h-full" role="img" aria-label="RE">
                  <defs>
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#5348F5" />
                      <stop offset="52%" stopColor="#4338CA" />
                      <stop offset="100%" stopColor="#2E268A" />
                    </linearGradient>
                  </defs>
                  <rect width="512" height="512" rx="118" fill={`url(#${gradId})`} />
                  <path
                    fill="#FFFFFF"
                    fillRule="evenodd"
                    d="M92 154 H188 C224 154 246 176 246 210 C246 237 230 257 205 264 L256 358 H206 L160 270 H136 V358 H92 Z M136 194 V232 H184 C198 232 206 224 206 213 C206 202 198 194 184 194 Z"
                  />
                  <path fill="rgba(49,46,129,0.22)" d="M160 270 H205 L219 296 H173 Z" />
                  <path fill="#FFFFFF" d="M276 154 H416 V194 H316 V236 H400 V276 H316 V318 H416 V358 H278 L254 316 V196 Z" />
                  <path fill="rgba(49,46,129,0.22)" d="M276 154 H316 L276 200 L254 196 Z" />
                </svg>
              </div>
            </div>

            <section
              ref={signinCardRef}
              onMouseMove={(e) => updateCardPointer(e.clientX, e.clientY)}
              onMouseLeave={resetCardPointer}
              onTouchStart={(e) => {
                signinCardRef.current?.classList.add("is-touching");
                if (e.touches[0]) updateCardPointer(e.touches[0].clientX, e.touches[0].clientY);
              }}
              onTouchMove={(e) => {
                if (e.touches[0]) updateCardPointer(e.touches[0].clientX, e.touches[0].clientY);
              }}
              onTouchEnd={() => {
                signinCardRef.current?.classList.remove("is-touching");
                resetCardPointer();
              }}
              onFocus={() => {
                isTypingRef.current = true;
                cardTarget.current = { rx: 0, ry: 0 };
              }}
              onBlur={() => {
                isTypingRef.current = false;
              }}
              className="re-signin-card rounded-[24px] p-6 sm:p-8"
            >
              <div className="re-signin-sheen" />
              <div className="relative space-y-5">
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-[#1E1B4B]">Sign in to RE</h1>
                  <p className="text-sm text-muted mt-1.5 leading-relaxed">
                    Developers, builders and channel partner agencies — one sign-in, straight to your workspace.
                  </p>
                </div>

                {/* Password / One-Tap OTP tabs: only when OTP sign-in is wired (onOtpSignIn). */}
                {onOtpSignIn && (
                <div className="flex items-center gap-5 border-b border-default pb-2.5 text-xs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === "password"}
                    onClick={() => setAuthMode("password")}
                    className={
                      authMode === "password"
                        ? "font-semibold text-[#4338CA] border-b-2 border-[#4338CA] pb-2.5 -mb-[11px] transition-colors"
                        : "font-medium text-subtle hover:text-[#1E1B4B] pb-2.5 -mb-[11px] transition-colors"
                    }
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === "otp"}
                    onClick={() => setAuthMode("otp")}
                    className={
                      authMode === "otp"
                        ? "font-semibold text-[#4338CA] border-b-2 border-[#4338CA] pb-2.5 -mb-[11px] transition-colors"
                        : "font-medium text-subtle hover:text-[#1E1B4B] pb-2.5 -mb-[11px] transition-colors"
                    }
                  >
                    One-Tap OTP
                  </button>
                </div>
                )}

                {notice}

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="re-email" className="block text-xs font-semibold text-foreground">
                        {authMode === "otp" ? "Work email or mobile number" : "Email"}
                      </label>
                      <span
                        className={`transition-all duration-200 inline-flex items-center gap-1 text-[10px] font-semibold text-success bg-success-bg border border-success/20/80 px-2 py-0.5 rounded-full ${
                          workspaceReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-0.5 pointer-events-none"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--chart-2)]" />
                        Workspace ready
                      </span>
                    </div>
                    <input
                      id="re-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      className="re-tactile-input w-full px-3.5 py-2.5 text-sm text-[#1E1B4B] placeholder:text-subtle"
                      required
                    />
                  </div>

                  {authMode === "password" ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="re-password" className="block text-xs font-semibold text-foreground">
                          Password
                        </label>
                        <Link
                          href={forgotPasswordHref}
                          className="text-xs font-semibold text-[#4338CA] hover:text-[#3730A3] transition-colors"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <input
                          id="re-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          className="re-tactile-input w-full px-3.5 py-2.5 pr-11 text-sm text-[#1E1B4B] placeholder:text-subtle"
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
                  ) : (
                    <div className="space-y-2">
                      <span className="block text-xs font-semibold text-foreground">6-digit sign-in code</span>
                      <div className="grid grid-cols-6 gap-2">
                        {otp.map((digit, idx) => (
                          <input
                            key={idx}
                            ref={(el) => { otpRefs.current[idx] = el; }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleOtpChange(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Backspace" && !digit && idx > 0) {
                                otpRefs.current[idx - 1]?.focus();
                              }
                            }}
                            aria-label={`OTP digit ${idx + 1}`}
                            className="re-tactile-input text-center font-bold text-base text-[#1E1B4B] px-0"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="text-xs font-medium text-danger bg-danger-bg border border-danger/25 rounded-xl px-3.5 py-2.5">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="re-btn-primary w-full rounded-[12px] text-sm font-semibold text-[#fff] flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {submitting ? "Signing in..." : authMode === "otp" ? "Verify OTP & Sign in" : "Sign in"}
                  </button>
                </form>

                <div className="pt-4 border-t border-default space-y-3 text-xs text-muted">
                  <div className="flex items-start gap-2 leading-relaxed">
                    <svg className="w-4 h-4 text-subtle shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                    </svg>
                    <span>
                      New here? Your company&apos;s admin adds you — look for the invitation email to set your password.
                    </span>
                  </div>
                  <div className="text-center">
                    New to RE?{" "}
                    <Link href={demoHref} className="font-semibold text-[#4338CA] hover:underline">
                      Book a demo
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            {/* Quiet Parent Endorsement Mention */}
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted">
              <img
                src="/brand/px-mark-mono-ink.svg"
                alt=""
                className="h-3.5 w-auto opacity-65"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <span>
                by <strong className="font-semibold text-[#1E1B4B]/80">Production X</strong>
              </span>
            </div>
          </div>

          <div className="hidden lg:block h-4" />
        </div>

        {/* RIGHT COLUMN: Connected 3D Live Floor Stack + Lead Sync & Site Visits */}
        <aside
          ref={stageRef}
          onMouseMove={(e) => {
            stageInteracting.current = true;
            updateStagePointer(e.clientX, e.clientY);
          }}
          onMouseLeave={() => {
            stageInteracting.current = false;
            stageTarget.current = { rx: 0, ry: 0 };
          }}
          onTouchStart={(e) => {
            stageInteracting.current = true;
            stageRef.current?.classList.add("is-touching");
            if (e.touches[0]) updateStagePointer(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchMove={(e) => {
            if (e.touches[0]) updateStagePointer(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchEnd={() => {
            stageInteracting.current = false;
            stageRef.current?.classList.remove("is-touching");
            stageTarget.current = { rx: 0, ry: 0 };
          }}
          className="lg:col-span-7 re-showcase-stage rounded-[32px] p-5 sm:p-7 flex flex-col justify-between gap-4 relative overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap relative z-10">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1E1B4B] leading-tight">
                Every lead answered. Every unit accounted for.
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Live lead sync, site visits, and 3D tower &amp; plot inventory in one workspace.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-surface/90 border border-[rgb(255_255_255)] shadow-sm rounded-full px-3 py-1 text-[11px] font-semibold text-[#1E1B4B] shrink-0">
              <span className="w-2 h-2 rounded-full bg-[var(--chart-2)] animate-pulse" />
              <span>Live Sync Active</span>
            </div>
          </div>

          {/* BEAT 1: Living 3D Isometric Floor Stack / Villa Plots */}
          <div className="re-glass-surface rounded-[22px] p-4 sm:p-5 relative z-10">
            <div className="re-glass-sheen" />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#4338CA]">
                  Interactive 3D Inventory
                </div>
                <div className="font-bold text-sm sm:text-base text-[#1E1B4B]">
                  {typology === "plots" ? "Sector A · HMDA Villa Plots" : "Tower A · Live Floor Stack"}
                </div>
              </div>
              <div className="inline-flex bg-surface-hover/90 p-0.5 rounded-full border border-default/70 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setTypology("apartments");
                    setActiveUnitCode("A-1403");
                    setSelectedDetail("Unit A-1403 · 3 BHK · Confirmed Saturday 11:00 AM");
                  }}
                  className={
                    typology === "apartments"
                      ? "px-2.5 py-1 rounded-full bg-surface text-[#1E1B4B] shadow-sm transition-all"
                      : "px-2.5 py-1 rounded-full text-muted hover:text-[#1E1B4B] transition-all"
                  }
                >
                  Apartments
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTypology("plots");
                    setActiveUnitCode("P-102");
                    setSelectedDetail("Plot P-102 · 267 sq.yd East · Open for Booking");
                  }}
                  className={
                    typology === "plots"
                      ? "px-2.5 py-1 rounded-full bg-surface text-[#1E1B4B] shadow-sm transition-all"
                      : "px-2.5 py-1 rounded-full text-muted hover:text-[#1E1B4B] transition-all"
                  }
                >
                  Villa Plots
                </button>
              </div>
            </div>

            <div className="re-iso-stage">
              {typology === "apartments" ? (
                <div ref={towerRef} className="re-iso-tower">
                  {FLOORS.map((floor) => (
                    <div
                      key={floor.level}
                      data-level={floor.level}
                      onClick={() => {
                        setActiveFloor(floor.level);
                        setActiveUnitCode(floor.units[0].code);
                        setSelectedDetail(floor.units[0].detail);
                        setActiveStep(3);
                      }}
                      className={`re-iso-floor ${activeFloor === floor.level ? "is-selected" : ""}`}
                    >
                      {floor.units.map((u) => (
                        <button
                          key={u.code}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveFloor(floor.level);
                            setActiveUnitCode(u.code);
                            setSelectedDetail(u.detail);
                            setActiveStep(3);
                          }}
                          className={`re-unit-tile ${u.colorClass} ${activeUnitCode === u.code ? "is-active" : ""}`}
                        >
                          {u.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div ref={plotsRef} className="re-iso-plots">
                  {PLOTS.map((p) => (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => {
                        setActiveUnitCode(p.code);
                        setSelectedDetail(p.detail);
                        setActiveStep(3);
                      }}
                      className={`re-unit-tile ${p.colorClass} ${activeUnitCode === p.code ? "is-active" : ""}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              {typology === "apartments" ? (
                <div className="inline-flex items-center gap-1.5">
                  {[2, 1, 0].map((lvl) => {
                    const fl = FLOORS.find((f) => f.level === lvl)!;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          setActiveFloor(lvl);
                          setActiveUnitCode(fl.units[0].code);
                          setSelectedDetail(fl.units[0].detail);
                          setActiveStep(3);
                        }}
                        className={
                          activeFloor === lvl
                            ? "px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#4338CA] text-[#fff] shadow-sm transition-all"
                            : "px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-hover text-muted hover:bg-surface-hover transition-all"
                        }
                      >
                        {fl.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="text-[11px] font-medium text-[#4338CA]">HMDA Sector A · Tap any plot</span>
              )}

              <div className="flex items-center gap-2.5 text-[10px] font-medium text-muted">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--chart-2)]" />Open</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#4338CA]" />Booked</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--chart-4)]" />Visit</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--chart-3)]" />Hold</span>
              </div>
            </div>
          </div>

          {/* BEAT 2: Live Lead Sync, Response SLA & Site Visits */}
          <div className="re-glass-surface rounded-[22px] p-4 sm:p-5 relative z-10 space-y-3">
            <div className="re-glass-sheen" />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4338CA]">
                  Lead Sync &amp; Site Visits
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-lg font-extrabold text-[#1E1B4B]">94%</span>
                  <span className="text-xs text-muted">contacted within 5 min</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2.5 py-1 rounded-full bg-success-bg text-success border border-success/20/80 text-[11px] font-semibold">
                  Optimal
                </span>
                <span className="px-2.5 py-1 rounded-full bg-success-bg text-success border border-success/20/80 text-[11px] font-semibold">
                  2 min 28 s
                </span>
              </div>
            </div>

            <div className="h-1.5 rounded-full re-sla-bar relative overflow-hidden">
              <div className="absolute right-[10%] top-0 bottom-0 w-1 bg-surface" />
            </div>

            <div className="space-y-1.5">
              {TIMELINE_STEPS.map((s, idx) => {
                const active = idx === activeStep;
                const rowText = idx === 3 ? selectedDetail : s.text;
                return (
                  <button
                    key={s.tag}
                    type="button"
                    onClick={() => setActiveStep(idx)}
                    className={`w-full text-left flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border transition-all ${
                      active
                        ? "bg-brand-light/55 border-brand/20 shadow-sm translate-x-1"
                        : "bg-surface/75 border-default/60 hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${s.tone}`}>
                        {s.tag}
                      </span>
                      <span className="text-xs font-medium text-[#1E1B4B] truncate">{rowText}</span>
                    </div>
                    <span className="text-[10px] font-mono text-subtle shrink-0">{s.time}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connected Real Estate Sources */}
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Synced Sources</span>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted">
              {["Meta Ads", "99acres", "MagicBricks", "Housing.com", "WhatsApp"].map((src) => (
                <span key={src} className="px-2.5 py-0.5 rounded-full bg-surface/85 border border-[rgb(255_255_255)] shadow-sm">
                  {src}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
