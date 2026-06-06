import React, { useState } from "react";
import { ArrowRight, Shield, Activity, CheckCircle2, Lock, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

const dlpFindings = [
  { type: "Aadhaar Exposed",  channel: "Email",      sev: "CRITICAL", dot: "bg-red-500" },
  { type: "AWS Key in Repo",  channel: "Code Review", sev: "CRITICAL", dot: "bg-red-500" },
  { type: "PAN in Email",     channel: "Email",      sev: "HIGH",     dot: "bg-orange-500" },
  { type: "Credit Card Data", channel: "USB Drive",  sev: "HIGH",     dot: "bg-orange-500" },
  { type: "IBAN in Clipboard",channel: "Clipboard",  sev: "MEDIUM",   dot: "bg-yellow-500" },
];

const certs = [
  { name: "api.serenyax.com",   algo: "RSA-2048",   expiry: "2026-03-12", status: "VALID" },
  { name: "auth.serenyax.com",  algo: "ECDSA P-256", expiry: "2025-12-01", status: "EXPIRING" },
  { name: "portal.internal",   algo: "RSA-4096",   expiry: "2026-08-20", status: "VALID" },
  { name: "device-fleet-cert", algo: "ECDSA P-384", expiry: "2025-11-15", status: "EXPIRING" },
  { name: "email.serenyax.com", algo: "RSA-2048",   expiry: "2027-01-30", status: "VALID" },
];

const DLPTab = () => (
  <motion.div key="dlp" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
    {/* Severity row */}
    <div className="grid grid-cols-4 border-b border-white/[0.06]">
      {[
        { label: "Critical", value: "3",  bg: "bg-red-500/10",    text: "text-red-400" },
        { label: "High",     value: "14", bg: "bg-orange-500/10", text: "text-orange-400" },
        { label: "Medium",   value: "38", bg: "bg-yellow-500/10", text: "text-yellow-400" },
        { label: "Low",      value: "92", bg: "bg-blue-500/10",   text: "text-blue-400" },
      ].map(s => (
        <div key={s.label} className={`flex flex-col items-center py-3 ${s.bg}`}>
          <span className={`text-xl font-bold font-mono ${s.text}`}>{s.value}</span>
          <span className="text-white/40 text-[10px] mt-0.5">{s.label}</span>
        </div>
      ))}
    </div>

    {/* Findings */}
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-3 h-3 text-[#4483f9]" />
        <span className="text-white/40 text-[10px] font-mono uppercase tracking-[0.12em]">Recent Findings</span>
      </div>
      <div className="space-y-1">
        {dlpFindings.map((f, i) => (
          <motion.div key={f.type} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.dot}`} />
              <span className="text-white/80 text-[12px] font-mono">{f.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/25 text-[10px]">{f.channel}</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                f.sev === "CRITICAL" ? "bg-red-500/20 text-red-400" :
                f.sev === "HIGH"     ? "bg-orange-500/20 text-orange-400" :
                                       "bg-yellow-500/20 text-yellow-400"}`}>{f.sev}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>

    {/* Coverage */}
    <div className="px-4 pb-3 pt-1 border-t border-white/[0.06]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-white/40 text-[10px] font-mono uppercase tracking-[0.1em]">Coverage</span>
        <span className="text-[#4483f9] text-[11px] font-bold font-mono">78% · 247 agents</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div className="h-full bg-gradient-to-r from-[#4483f9] to-cyan-400 rounded-full"
          initial={{ width: 0 }} animate={{ width: "78%" }} transition={{ duration: 1.1, delay: 0.2, ease: "easeOut" }} />
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        <span className="text-emerald-400 text-[10px] font-mono">11 channels active · 50+ data types</span>
      </div>
    </div>
  </motion.div>
);

const CLMTab = () => (
  <motion.div key="clm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
    {/* CLM summary */}
    <div className="grid grid-cols-3 border-b border-white/[0.06]">
      {[
        { label: "Total Certs", value: "1,247", text: "text-cyan-400" },
        { label: "Compliance",  value: "94.3%", text: "text-emerald-400" },
        { label: "Expiring",    value: "23",    text: "text-orange-400" },
      ].map(s => (
        <div key={s.label} className="flex flex-col items-center py-3 bg-white/[0.02]">
          <span className={`text-xl font-bold font-mono ${s.text}`}>{s.value}</span>
          <span className="text-white/40 text-[10px] mt-0.5">{s.label}</span>
        </div>
      ))}
    </div>

    {/* Cert list */}
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Lock className="w-3 h-3 text-emerald-400" />
        <span className="text-white/40 text-[10px] font-mono uppercase tracking-[0.12em]">Certificate Inventory</span>
      </div>
      <div className="space-y-1">
        {certs.map((c, i) => (
          <motion.div key={c.name} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.status === "VALID" ? "bg-emerald-400" : "bg-orange-400"}`} />
              <span className="text-white/80 text-[11px] font-mono truncate max-w-[150px]">{c.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/25 text-[10px]">{c.algo}</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                c.status === "VALID" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"}`}>{c.status}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>

    {/* Automation */}
    <div className="px-4 pb-3 pt-1 border-t border-white/[0.06]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <RefreshCcw className="w-3 h-3 text-cyan-400" />
        <span className="text-white/40 text-[10px] font-mono uppercase tracking-[0.1em]">Automation</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {["Auto-Renewal ON", "ACME Active", "8 CAs linked"].map(t => (
          <span key={t} className="flex items-center gap-1 text-[10px] text-white/50 font-mono">
            <span className="w-1 h-1 rounded-full bg-emerald-400" />{t}
          </span>
        ))}
      </div>
    </div>
  </motion.div>
);

const PlatformMockup = () => {
  const [tab, setTab] = useState<"dlp" | "clm">("dlp");
  return (
    <div className="w-full max-w-[480px] rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(68,131,249,0.2)] border border-[#4483f9]/20 bg-[#060c1e] select-none">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a1228] border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#4483f9]" />
          <span className="text-white/70 text-[12px] font-semibold tracking-wide font-mono">SerenyaX · Platform</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-[10px] font-mono tracking-wider">LIVE</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06] bg-[#080f1f]">
        {(["dlp", "clm"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[12px] font-semibold font-mono tracking-wide transition-colors ${
              tab === t
                ? "text-[#4483f9] border-b-2 border-[#4483f9] bg-[#4483f9]/5"
                : "text-white/35 hover:text-white/60"
            }`}
          >
            {t === "dlp" ? "▸ Xyberguard-DLP" : "▸ Xyberguard-CLM"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === "dlp" ? <DLPTab /> : <CLMTab />}
      </AnimatePresence>
    </div>
  );
};

const capabilities = [
  { label: "Penetration Testing", color: "bg-blue-400" },
  { label: "Red Teaming",         color: "bg-red-400" },
  { label: "DLP",                 color: "bg-cyan-400" },
  { label: "CLM",                 color: "bg-emerald-400" },
  { label: "VAPT",                color: "bg-violet-400" },
  { label: "Threat Intelligence", color: "bg-orange-400" },
];

const stats = [
  { value: "300+", label: "Security Assessments" },
  { value: "200+", label: "Enterprise Clients"    },
  { value: "11",   label: "DLP Channels"          },
  { value: "50+",  label: "Data Types Detected"   },
];

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(135deg, #06091a 0%, #080e24 40%, #0a1433 100%)" }}
    >
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-[600px] h-[600px] bg-[#4483f9]/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Main hero content */}
      <div className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 flex items-center pt-40 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-20 items-center w-full">

          {/* ── LEFT: Text content ── */}
          <motion.div
            className="flex flex-col gap-6 z-10"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/8 border border-white/15 self-start">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-white/65 text-xs tracking-[0.15em] uppercase font-medium">
                Unified Cybersecurity Platform
              </span>
            </div>

            {/* Headline */}
            <h1
              className="text-white leading-[1.05] text-4xl sm:text-5xl lg:text-6xl xl:text-[68px]"
              style={{ fontFamily: "'Inter Tight', 'Inter', sans-serif", letterSpacing: "-0.02em" }}
            >
              <span className="font-light block">Know Before</span>
              <span className="font-bold block">
                You're{" "}
                <span
                  className="relative text-[#4483f9]"
                  style={{ textDecoration: "line-through", textDecorationColor: "rgba(255,73,73,0.7)" }}
                >
                  Known
                </span>
              </span>
            </h1>

            {/* Sub-headline */}
            <p
              className="text-white/55 text-base sm:text-lg leading-relaxed max-w-lg"
              style={{ fontFamily: "'Inter Tight', 'Inter', sans-serif", fontWeight: 300 }}
            >
              Enterprise-grade penetration testing, data loss prevention, and certificate lifecycle management —
              {" "}<span className="text-white/80 font-medium">one platform, complete coverage.</span>
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate("/contact-us")}
                className="flex items-center gap-2 bg-[#4483f9] hover:bg-[#5a94ff] text-white font-semibold px-7 py-3.5 rounded-xl transition-colors duration-200 text-[15px] shadow-[0_0_24px_rgba(68,131,249,0.35)]"
              >
                Get a Free Assessment
                <ArrowRight className="w-4 h-4" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate("/contact-us")}
                className="flex items-center gap-2 border border-white/25 hover:border-white/50 text-white/80 hover:text-white font-medium px-7 py-3.5 rounded-xl transition-all duration-200 text-[15px] bg-white/5 hover:bg-white/10"
              >
                Watch Demo
              </motion.button>
            </div>

            {/* Capability tags */}
            <div className="flex flex-col gap-2 pt-2">
              <span className="text-white/25 text-[10px] tracking-[0.2em] uppercase font-medium">Core Capabilities</span>
              <div className="flex flex-wrap gap-2">
                {capabilities.map(({ label, color }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 bg-white/[0.07] border border-white/[0.12] text-white/75 text-[12px] font-medium px-3.5 py-1.5 rounded-lg transition-colors hover:bg-white/[0.11]"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── RIGHT: Security mockup ── */}
          <motion.div
            className="hidden lg:flex justify-end z-10"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: "easeOut" }}
          >
            <PlatformMockup />
          </motion.div>
        </div>
      </div>

      {/* ── Stats bar at bottom of hero (Tenable style) ── */}
      <motion.div
        className="border-t border-white/[0.08] bg-white/[0.03]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.08]">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.08 }}
                className="flex flex-col items-center justify-center text-center py-7 px-4"
              >
                <span className="text-3xl sm:text-4xl font-bold text-[#4483f9] tracking-tight leading-none">
                  {s.value}
                </span>
                <span className="text-white/45 text-[12px] mt-1.5 font-medium">{s.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
