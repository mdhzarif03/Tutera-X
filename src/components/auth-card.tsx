import type { ReactNode } from "react";
import { CalendarCheck, MessageSquare, ShieldCheck, Users, Wallet } from "lucide-react";
import { Logo } from "./logo";
import { InstallAppButton } from "./install-app-button";

const FEATURES = [
  { icon: Users, text: "Students, classes and parents in one place" },
  { icon: CalendarCheck, text: "Attendance that keeps parents informed" },
  { icon: Wallet, text: "Fees and payments, all in one place" },
  { icon: MessageSquare, text: "See what a message costs before you send it" },
  { icon: ShieldCheck, text: "Private accounts and safe sign-in links" },
];

export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="auth-bg relative flex min-h-dvh items-center justify-center px-4 py-10 sm:py-14">
      <InstallAppButton className="absolute right-4 top-4 z-10" />
      <div className="tx-enter grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-indigo-900/10 ring-1 ring-slate-200/80 md:grid-cols-2">
        <aside className="brand-panel relative hidden flex-col justify-between overflow-hidden p-10 text-white md:flex">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" aria-hidden="true" />
          <Logo inverse className="relative" />
          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight tracking-tight">
              Run your teaching,
              <br />
              <span className="text-amber-300">not the paperwork.</span>
            </h2>
            <ul className="mt-8 space-y-4">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-sm text-indigo-50">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/12 ring-1 ring-white/15">
                    <Icon className="h-4 w-4 text-amber-300" aria-hidden="true" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-indigo-200/80">Built for tutors, schools and families.</p>
        </aside>

        <section className="flex flex-col justify-center p-7 sm:p-10">
          <div className="mb-8 md:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {description ? <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p> : null}
          <div className="mt-7">{children}</div>
        </section>
      </div>
    </main>
  );
}
