import {
  ArrowRight,
  Shield,
  Eye,
  Lock,
  AlertTriangle,
  FileText,
  Cpu,
  Database,
  Monitor,
  Cloud,
  Usb,
  Mail,
  BarChart3,
  CheckCircle2,
} from "lucide-react";
import { motion, Variants, easeOut } from "framer-motion";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import React from "react";

import securityBg from "@/assets/images/security-bg.jpg";
import featureImg from "@/assets/images/features.png";

const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: easeOut } },
};

const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: easeOut } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: easeOut } },
};

const DLPDashboardMockup = () => (
  <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#0d1117] font-mono text-xs select-none">
    {/* Title bar */}
    <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-white/10">
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
      </div>
      <span className="text-white/40 text-[11px] tracking-wide">XyberGuard DLP — CISO Dashboard</span>
      <div className="w-14" />
    </div>

    {/* Stats row */}
    <div className="grid grid-cols-4 gap-px bg-white/5 border-b border-white/10">
      {[
        { label: "Critical", value: "3", color: "text-red-400" },
        { label: "High", value: "14", color: "text-orange-400" },
        { label: "Medium", value: "38", color: "text-yellow-400" },
        { label: "Agents", value: "247", color: "text-cyan-400" },
      ].map((s) => (
        <div key={s.label} className="bg-[#0d1117] px-3 py-3 flex flex-col gap-0.5">
          <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
          <span className="text-white/40 text-[10px] uppercase tracking-wider">{s.label}</span>
        </div>
      ))}
    </div>

    {/* Recent findings */}
    <div className="px-4 py-3 border-b border-white/10">
      <div className="text-white/30 text-[10px] uppercase tracking-widest mb-2">Recent Findings</div>
      {[
        { type: "Credit Card", channel: "Email", sev: "HIGH", host: "ws-fin-04" },
        { type: "Aadhaar Number", channel: "USB", sev: "CRITICAL", host: "laptop-hr-12" },
        { type: "PAN Card", channel: "Clipboard", sev: "HIGH", host: "dev-desktop-07" },
        { type: "AWS API Key", channel: "Network", sev: "CRITICAL", host: "build-server-01" },
        { type: "IBAN Number", channel: "Cloud Upload", sev: "MEDIUM", host: "ws-finance-22" },
      ].map((f, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              f.sev === "CRITICAL" ? "bg-red-400" : f.sev === "HIGH" ? "bg-orange-400" : "bg-yellow-400"
            }`} />
            <span className="text-white/80 text-[11px]">{f.type}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/30 text-[10px]">{f.channel}</span>
            <span className="text-white/40 text-[10px]">{f.host}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
              f.sev === "CRITICAL" ? "bg-red-500/20 text-red-400" :
              f.sev === "HIGH" ? "bg-orange-500/20 text-orange-400" :
              "bg-yellow-500/20 text-yellow-400"
            }`}>{f.sev}</span>
          </div>
        </div>
      ))}
    </div>

    {/* Channel monitoring */}
    <div className="px-4 py-3">
      <div className="text-white/30 text-[10px] uppercase tracking-widest mb-2">Channel Coverage</div>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          ["USB/Removable", "active"], ["Email Monitor", "active"],
          ["Clipboard", "active"], ["Cloud Storage", "active"],
          ["Network (HTTPS)", "active"], ["OCR Scanner", "active"],
        ].map(([ch, status]) => (
          <div key={ch} className="flex items-center gap-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-white/50 text-[10px]">{ch}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const DLPPipelineDiagram = () => {
  const stages = [
    {
      step: "01",
      label: "Data Capture",
      color: "from-blue-600 to-blue-500",
      border: "border-blue-500/40",
      items: ["USB & Removable Media", "Email (SMTP/IMAP/O365)", "Clipboard & Screens", "Cloud Uploads"],
    },
    {
      step: "02",
      label: "Detection Engine",
      color: "from-violet-600 to-purple-500",
      border: "border-violet-500/40",
      items: ["Regex (70+ patterns)", "Luhn / IBAN Validator", "Dictionary Matching", "OCR — EN/HI/TA/TE"],
    },
    {
      step: "03",
      label: "Risk Scoring",
      color: "from-orange-500 to-amber-500",
      border: "border-orange-500/40",
      items: ["Confidence threshold", "Context correlation", "Severity assignment", "Policy match"],
    },
    {
      step: "04",
      label: "Enforce & Alert",
      color: "from-emerald-600 to-green-500",
      border: "border-emerald-500/40",
      items: ["Block / Monitor / Alert", "Slack / Teams / Email", "SIEM (Splunk, QRadar)", "Incident created"],
    },
  ];

  return (
    <div className="w-full max-w-md space-y-2">
      {stages.map((stage, idx) => (
        <div key={stage.step} className="relative">
          {idx < stages.length - 1 && (
            <div className="absolute left-[22px] top-full w-[2px] h-2 bg-gradient-to-b from-white/20 to-transparent z-10" />
          )}
          <div className={`rounded-xl border ${stage.border} bg-[#0d1117] overflow-hidden`}>
            <div className={`flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r ${stage.color}`}>
              <span className="text-white/70 text-xs font-mono font-bold">{stage.step}</span>
              <span className="text-white font-semibold text-sm tracking-wide">{stage.label}</span>
            </div>
            <div className="px-4 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
              {stage.items.map((item) => (
                <div key={item} className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-white/30 flex-shrink-0" />
                  <span className="text-white/60 text-[11px]">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-cyan-400 text-lg font-bold">⚡</span>
        </div>
        <div>
          <div className="text-cyan-300 text-xs font-semibold">End-to-end latency: ~10 seconds</div>
          <div className="text-white/40 text-[11px]">Detect → Batch → Collector → Kafka → Scan → Alert</div>
        </div>
      </div>
    </div>
  );
};

const whyPoints = [
  {
    id: 1,
    title: "Stop Data Exfiltration Across 11 Channels",
    desc: `
• USB & removable media with read-only enforcement and device quarantine
• Email (SMTP/IMAP/Office 365), clipboard, screen capture, and print monitoring
• Cloud storage (AWS S3, Azure Blob, GCS), HTTP/HTTPS uploads, SMB/FTP file motion
• Database scanning (MySQL, PostgreSQL, MSSQL) and OCR for images & PDFs
    `,
  },
  {
    id: 2,
    title: "Detect 50+ Sensitive Data Types with 93% Accuracy",
    desc: `
• Credit cards (Luhn-validated), SSN, IBAN, GDPR personal & special-category data
• All 8 India DPDP Act 2023 identifiers — Aadhaar, PAN, UPI, Voter ID, Driving License and more
• Cloud credentials: AWS keys, GitHub tokens, JWT, RSA private keys, Stripe, Twilio
• Healthcare PHI/HIPAA, medical record numbers, NPI, DEA numbers
    `,
  },
  {
    id: 3,
    title: "Rapid Deployment with Enterprise-Wide Coverage",
    desc: `
• Deploy in 60 minutes via Docker Compose or Kubernetes for 1M+ endpoint scale
• 31 out-of-box policy templates covering PCI-DSS, HIPAA, GDPR, India DPDP Act 2023
• MDM/GPO integration (Intune, Jamf, SCCM) for silent enterprise rollout
• Offline AES-256-GCM buffering — no findings lost during network interruptions
    `,
  },
];

const keyFeatures = [
  {
    id: 1,
    color: "from-blue-600 to-cyan-500",
    icon: <Shield size={28} className="text-white" />,
    title: "11 Monitoring Channels",
    description:
      "File scanner, USB, email, clipboard, screen capture, print, cloud storage, network (HTTPS MITM), files in motion, database, and OCR — every data path covered.",
  },
  {
    id: 2,
    color: "from-purple-600 to-pink-500",
    icon: <Eye size={28} className="text-white" />,
    title: "6-Layer Detection Pipeline",
    description:
      "Regex (70+ patterns) → Validator (Luhn/IBAN/IFSC) → Dictionary (Aho-Corasick) → OCR (Tesseract) → Fingerprinting → Context scoring. 93/100 accuracy.",
  },
  {
    id: 3,
    color: "from-green-500 to-emerald-600",
    icon: <Cpu size={28} className="text-white" />,
    title: "Lightweight Cross-Platform Agent",
    description:
      "25 MB binary, <50 MB memory, <5% CPU. Windows, Linux, macOS (Intel + Apple Silicon). Zero-flag startup after one-time enrollment. Config hot-reloads in 5 minutes.",
  },
  {
    id: 4,
    color: "from-orange-500 to-red-500",
    icon: <Lock size={28} className="text-white" />,
    title: "Tamper-Evident Audit Trail",
    description:
      "SHA-256 hash-chained + HMAC-SHA256 signed records across 6 parallel chains. Verifiable end-to-end. GDPR Art. 17 erasure without breaking audit integrity.",
  },
  {
    id: 5,
    color: "from-teal-500 to-blue-600",
    icon: <Database size={28} className="text-white" />,
    title: "India DPDP Act 2023 — 95% Score",
    description:
      "All 8 identifiers detected across all 11 channels. OCR in Hindi, Tamil, and Telugu. 8 dedicated policy templates. The only enterprise DLP with native DPDP compliance.",
  },
  {
    id: 6,
    color: "from-indigo-600 to-violet-700",
    icon: <BarChart3 size={28} className="text-white" />,
    title: "CISO Dashboard & Reports",
    description:
      "16-page management console. Executive summary, compliance reports (GDPR/PCI/HIPAA), agent health, incident management, and Grafana dashboards for threat hunting.",
  },
  {
    id: 7,
    color: "from-slate-600 to-gray-800",
    icon: <Cloud size={28} className="text-white" />,
    title: "10 SIEM/SOAR Integrations",
    description:
      "Slack, Microsoft Teams, Email, Splunk, QRadar, Sentinel, PagerDuty, ServiceNow, Jira, and Wazuh. Real-time alerts delivered where your team already works.",
  },
];

const howItWorksSteps = [
  {
    icon: Cpu,
    title: "Deploy the Agent",
    desc: `• Single 25 MB binary — Windows, Linux, macOS (Intel + Apple Silicon)
• Enroll via MDM/GPO (Intune, Jamf, SCCM) or Docker Compose in 60 minutes
• Offline AES-256-GCM buffer — no findings lost on network interruptions`,
  },
  {
    icon: FileText,
    title: "Configure Policies",
    desc: `• Choose from 31 out-of-box templates: PCI-DSS, HIPAA, GDPR, India DPDP Act 2023
• Assign policies per device, user group, or department
• Server-driven config syncs to agents every 5 minutes — no agent restart needed`,
  },
  {
    icon: AlertTriangle,
    title: "Detect, Alert & Respond",
    desc: `• 6-layer pipeline detects sensitive data with 93/100 accuracy
• Real-time alerts via Slack, Teams, Email, Splunk, QRadar, PagerDuty
• CISO dashboard with severity timelines, threat hunting, and incident management`,
  },
];

const compliance = [
  { label: "India DPDP Act 2023", score: "95%", color: "from-orange-500 to-red-500" },
  { label: "GDPR (EU)", score: "Native", color: "from-blue-500 to-cyan-500" },
  { label: "PCI-DSS v4.0", score: "✓", color: "from-green-500 to-emerald-600" },
  { label: "HIPAA (US)", score: "✓", color: "from-purple-500 to-pink-500" },
  { label: "ISO 27001", score: "✓", color: "from-teal-500 to-blue-600" },
  { label: "CCPA (US)", score: "✓", color: "from-indigo-500 to-violet-600" },
];

const channels = [
  { icon: Usb, label: "USB & Removable Media" },
  { icon: Mail, label: "Email (SMTP/IMAP/O365)" },
  { icon: Monitor, label: "Clipboard & Screen Capture" },
  { icon: Cloud, label: "Cloud Storage (S3/Azure/GCS)" },
  { icon: Database, label: "Database Scanner" },
  { icon: Eye, label: "OCR (Images & PDFs)" },
];

const XyberguardDLP = () => {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState(1);
  const { theme } = useTheme();

  return (
    <div className={`transition-colors duration-500 ${theme === "dark" ? "dark" : ""}`}>

      {/* Hero Section */}
      <section
        className="relative min-h-[66vh] flex items-center justify-center overflow-hidden pt-40 pb-10"
        style={{
          backgroundImage: `url(${securityBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          fontFamily: "'Whyte', sans-serif",
        }}
      >
        <div className="absolute inset-0 bg-black/80 dark:bg-black/90" />
        <div className="relative z-10 flex flex-col items-center text-center px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInLeft}
            className="space-y-4 sm:space-y-8 flex flex-col items-center justify-center"
          >
            <h1
              className="font-normal leading-tight max-w-6xl text-white
                text-[20px] sm:text-[28px] md:text-[55px] md:leading-[1.1]"
            >
              <span className="relative">
                <span className="absolute inset-0 blur-md text-cyan-400 opacity-60">
                  Xyberguard-DLP
                </span>
                <span className="relative text-cyan-300">Xyberguard-DLP</span>
              </span>{" "}
              <span className="text-white/90">
                Enterprise Data Loss Prevention
              </span>
            </h1>

            <p
              className="max-w-4xl mx-auto text-white/80
                text-[13px] sm:text-[16px] md:text-[22px] leading-relaxed"
              style={{ fontWeight: 300 }}
            >
              Enterprise-grade DLP protecting 1M+ endpoints across 11 channels.
              Native India DPDP Act 2023 compliance. Built for modern cloud environments.
            </p>

            <div className="flex flex-wrap gap-3 justify-center">
              <motion.button
                onClick={() => navigate("/contact-us")}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                className="relative flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold
                  text-white text-sm border border-white/50 bg-transparent overflow-hidden group"
              >
                <span className="absolute inset-0 bg-[#4483f9] scale-x-0 group-hover:scale-x-100 origin-right transition-transform duration-300 ease-out" />
                <span className="relative z-10">Get a Demo</span>
                <div className="relative z-10 bg-[#4483f9] rounded-full p-1.5">
                  <ArrowRight className="w-4 h-4 text-white" />
                </div>
              </motion.button>
            </div>

            {/* Stats bar */}
            <div className="flex flex-wrap gap-6 justify-center mt-2">
              {[
                { value: "11", label: "Monitoring Channels" },
                { value: "50+", label: "Data Types" },
                { value: "93/100", label: "Detection Accuracy" },
                { value: "31", label: "Policy Templates" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-cyan-300 font-bold text-xl sm:text-2xl">{stat.value}</div>
                  <div className="text-white/60 text-xs sm:text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* What We Offer */}
      <section className="w-full px-2 sm:px-4 md:px-6 py-16 bg-[#f8f7f4] dark:bg-[#0b0c1b] transition-colors duration-500">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="text-center flex flex-col items-center mx-auto mb-10 px-4"
        >
          <div className="text-xs font-semibold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 uppercase mb-3">
            XYBERGUARD DATA LOSS PREVENTION
          </div>
          <div className="relative inline-block">
            <h2
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#0b0c1b] dark:text-white"
              style={{ fontFamily: "Whyte, sans-serif", lineHeight: "1.1" }}
            >
              Why Xyberguard-DLP?
            </h2>
            <span className="absolute left-1/2 -bottom-2 w-3/6 h-[3px] bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 transform -translate-x-1/2 rounded-full" />
          </div>
        </motion.div>

        <div className="container mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInLeft}
              className="space-y-8 max-w-2xl mx-auto w-full"
            >
              {whyPoints.map((item) => (
                <div key={item.id} className="relative">
                  <div
                    onClick={() => setActiveId(item.id)}
                    className="flex items-start gap-4 cursor-pointer group"
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm transition-all duration-300 ${
                        activeId === item.id
                          ? "bg-[#0B57D0] dark:bg-blue-500 scale-110"
                          : "bg-black dark:bg-gray-700"
                      }`}
                    >
                      {item.id}
                    </div>
                    <h5
                      className={`text-[16px] sm:text-[18px] transition-colors duration-300 ${
                        activeId === item.id
                          ? "text-[#0B57D0] dark:text-blue-400"
                          : "text-gray-800 dark:text-gray-200 group-hover:text-blue-500"
                      }`}
                      style={{ fontFamily: "'Whyte', sans-serif" }}
                    >
                      {item.title}
                    </h5>
                  </div>

                  <motion.div
                    initial={false}
                    animate={{
                      height: activeId === item.id ? "auto" : 0,
                      opacity: activeId === item.id ? 1 : 0,
                    }}
                    transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden ml-12 mt-2"
                  >
                    <div className="relative pb-2">
                      <ul className="text-gray-600 dark:text-gray-400 text-[14px] sm:text-[15px] leading-snug list-disc pl-4 space-y-1">
                        {item.desc
                          .trim()
                          .split("•")
                          .filter((line) => line.trim() !== "")
                          .map((line, idx) => (
                            <li key={idx}>{line.trim()}</li>
                          ))}
                      </ul>
                      {activeId === item.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "100%", opacity: 1 }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          className="absolute right-[-20px] top-[-28px] w-[3px] h-[calc(100%+32px)] bg-[#083b99] dark:bg-blue-600 rounded-full opacity-95"
                        />
                      )}
                    </div>
                  </motion.div>
                </div>
              ))}
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInRight}
              className="flex justify-center w-full"
            >
              <DLPDashboardMockup />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Monitoring Channels Strip */}
      <section className="py-10 bg-[#0b0c1b] dark:bg-[#050810]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="container mx-auto px-4"
        >
          <p className="text-center text-white/50 text-xs tracking-widest uppercase mb-6">
            11 Monitoring Channels — Every data path covered
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {channels.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/50 transition-colors"
              >
                <Icon className="text-cyan-400" size={22} />
                <span className="text-white/70 text-xs text-center leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-3 sm:px-6 md:px-16 bg-white dark:bg-[#0b0c1b] transition-colors duration-500">
        <div className="text-center mb-10">
          <h2
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#0b0c1b] dark:text-white"
            style={{ fontFamily: "Whyte, sans-serif", lineHeight: "1.1" }}
          >
            How Xyberguard-DLP works
          </h2>
          <p className="text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mt-4 text-base md:text-lg">
            Deploy in minutes, configure with 31 pre-built policy templates, and get real-time
            alerts across Slack, Teams, SIEM and more.
          </p>
        </div>

        <div className="container mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center">
          <div className="flex justify-center lg:justify-end">
            <DLPPipelineDiagram />
          </div>

          <div className="space-y-10 text-left px-2 sm:px-4 md:px-0">
            {howItWorksSteps.map((step, idx) => (
              <div key={idx} className="group">
                <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
                  <step.icon
                    className="text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300"
                    size={26}
                  />
                  {step.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base leading-relaxed whitespace-pre-line">
                  {step.desc}
                </p>
                <div className="mt-3 h-[3px] bg-gradient-to-r from-blue-500 to-cyan-400 w-28 rounded-full group-hover:w-36 transition-all duration-300" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section
        className="py-14 text-gray-900 dark:bg-[#0b0c1b] dark:text-gray-200 relative overflow-hidden"
        style={{
          backgroundImage: `url(${featureImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-12">
            <h2
              className="relative inline-block text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#0b0c1b] dark:text-white"
              style={{ fontFamily: "Whyte, sans-serif", lineHeight: "1.1" }}
            >
              Key Features
              <span className="absolute left-1/2 -bottom-4 w-3/6 h-[3px] bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 transform -translate-x-1/2 rounded-full" />
            </h2>
            <p className="max-w-3xl mx-auto mt-8 text-gray-600 dark:text-gray-400 text-base md:text-lg">
              Enterprise-grade data protection across every channel — USB, email, cloud, network,
              clipboard, database, and more — across every channel your data travels.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-10 justify-items-center">
            {keyFeatures.map((feature) => (
              <div key={feature.id} className="relative group">
                <div
                  className={`absolute bottom-0 left-0 w-[98%] h-[95%] translate-x-[-8px] translate-y-[8px] bg-gradient-to-r ${feature.color} rounded-tr-[3rem] rounded-bl-[3rem] opacity-90 transition-transform duration-500 group-hover:translate-x-[-5px] group-hover:translate-y-[5px]`}
                />
                <div className="relative bg-white rounded-tr-[3rem] rounded-bl-[3rem] shadow-lg border border-gray-100 text-center p-8 transition-transform duration-500 group-hover:scale-[1.02] overflow-visible min-h-[220px] flex flex-col">
                  <div
                    className={`absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-r ${feature.color} shadow-lg border-4 border-white z-10`}
                  >
                    {feature.icon}
                  </div>
                  <div className="flex flex-col flex-grow justify-center mt-6">
                    <h3
                      className={`text-xl font-semibold bg-gradient-to-r ${feature.color} bg-clip-text text-transparent mb-4`}
                    >
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed px-2">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance Coverage */}
      <section className="py-16 bg-[#f8f7f4] dark:bg-[#0b0c1b] transition-colors duration-500">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="container mx-auto px-4"
        >
          <div className="text-center mb-10">
            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-light text-[#0b0c1b] dark:text-white"
              style={{ fontFamily: "Whyte, sans-serif" }}
            >
              Compliance Coverage
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-3 text-base max-w-2xl mx-auto">
              Built-in policy templates and detection rules mapped to major regulatory frameworks.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 max-w-5xl mx-auto">
            {compliance.map(({ label, score, color }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white dark:bg-gray-800 shadow-md border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-shadow"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br ${color} text-white font-bold text-sm`}
                >
                  {score}
                </div>
                <span className="text-gray-700 dark:text-gray-300 text-xs text-center font-medium leading-tight">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-16 bg-white dark:bg-[#0b0c1b] transition-colors duration-500 overflow-x-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="container mx-auto px-4"
        >
          <div className="text-center mb-10">
            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-light text-[#0b0c1b] dark:text-white"
              style={{ fontFamily: "Whyte, sans-serif" }}
            >
              Feature Comparison
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-3 text-base max-w-2xl mx-auto">
              How Xyberguard-DLP stacks up against enterprise DLP solutions.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-[#4483f9] to-[#2563eb] text-white">
                  <th className="text-left px-5 py-4 font-semibold rounded-tl-2xl w-[38%]">Feature</th>
                  <th className="px-4 py-4 font-bold text-cyan-200 w-[16%]">Xyberguard-DLP</th>
                  <th className="px-4 py-4 font-semibold text-white/80 w-[16%]">Symantec DLP</th>
                  <th className="px-4 py-4 font-semibold text-white/80 w-[16%]">Forcepoint</th>
                  <th className="px-4 py-4 font-semibold text-white/80 rounded-tr-2xl w-[14%]">Seqrite</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    feature: "Monitoring Channels",
                    xyber: "11 channels",
                    sym: "8–10 channels",
                    fp: "8–10 channels",
                    seq: "6–8 channels",
                    highlight: true,
                  },
                  {
                    feature: "Data Types Detected",
                    xyber: "50+ types",
                    sym: "50+ types",
                    fp: "50+ types",
                    seq: "30+ types",
                    highlight: false,
                  },
                  {
                    feature: "India DPDP Act 2023 — All 8 Identifiers",
                    xyber: "✅ Native (95% score)",
                    sym: "❌ Not native",
                    fp: "❌ Not native",
                    seq: "⚠️ Partial",
                    highlight: true,
                  },
                  {
                    feature: "OCR Detection (Images & PDFs)",
                    xyber: "✅ Tesseract — EN/HI/TA/TE",
                    sym: "✅ English only",
                    fp: "✅ English only",
                    seq: "⚠️ Limited",
                    highlight: false,
                  },
                  {
                    feature: "HTTPS / Network MITM Inspection",
                    xyber: "✅ Agent-side TLS termination",
                    sym: "✅ Proxy-based",
                    fp: "✅ Proxy-based",
                    seq: "⚠️ Limited",
                    highlight: false,
                  },
                  {
                    feature: "USB Read-Only Enforcement",
                    xyber: "✅ Windows + Linux",
                    sym: "✅",
                    fp: "✅",
                    seq: "✅",
                    highlight: false,
                  },
                  {
                    feature: "Tamper-Evident Audit Trail",
                    xyber: "✅ SHA-256 hash chain + HMAC",
                    sym: "⚠️ Standard logging",
                    fp: "⚠️ Standard logging",
                    seq: "❌",
                    highlight: true,
                  },
                  {
                    feature: "GDPR / PCI-DSS / HIPAA Coverage",
                    xyber: "✅ All three native",
                    sym: "✅",
                    fp: "✅",
                    seq: "⚠️ Partial",
                    highlight: false,
                  },
                  {
                    feature: "Out-of-Box Policy Templates",
                    xyber: "31 templates",
                    sym: "40+ templates",
                    fp: "30+ templates",
                    seq: "15–20 templates",
                    highlight: false,
                  },
                  {
                    feature: "Agent Footprint",
                    xyber: "25 MB / <50 MB RAM / <5% CPU",
                    sym: "150–300 MB RAM",
                    fp: "200–400 MB RAM",
                    seq: "80–150 MB RAM",
                    highlight: true,
                  },
                  {
                    feature: "Cross-Platform (Win / Linux / macOS)",
                    xyber: "✅ All three incl. Apple Silicon",
                    sym: "✅",
                    fp: "⚠️ Windows-first",
                    seq: "⚠️ Windows-first",
                    highlight: false,
                  },
                  {
                    feature: "SIEM / SOAR Integrations",
                    xyber: "10 (Splunk, QRadar, Sentinel, Jira…)",
                    sym: "15+ enterprise",
                    fp: "10+ enterprise",
                    seq: "5–8",
                    highlight: false,
                  },
                  {
                    feature: "Incident Management",
                    xyber: "✅ Built-in with SLA tracking",
                    sym: "✅",
                    fp: "✅",
                    seq: "⚠️ Basic",
                    highlight: false,
                  },
                  {
                    feature: "Deployment",
                    xyber: "Docker / K8s / MDM / GPO",
                    sym: "On-prem / Cloud",
                    fp: "On-prem / Cloud",
                    seq: "On-prem",
                    highlight: false,
                  },
                  {
                    feature: "Detection Accuracy Score",
                    xyber: "93 / 100",
                    sym: "~90 / 100",
                    fp: "~88 / 100",
                    seq: "~80 / 100",
                    highlight: true,
                  },
                ].map((row, idx) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-gray-100 dark:border-gray-800 transition-colors ${
                      row.highlight
                        ? "bg-blue-50/60 dark:bg-blue-900/10"
                        : idx % 2 === 0
                        ? "bg-white dark:bg-[#0f172a]"
                        : "bg-gray-50/60 dark:bg-[#111827]"
                    }`}
                  >
                    <td className="px-5 py-3.5 text-gray-800 dark:text-gray-200 font-medium">
                      {row.feature}
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-[#4483f9] dark:text-cyan-400">
                      {row.xyber}
                    </td>
                    <td className="px-4 py-3.5 text-center text-gray-600 dark:text-gray-400">
                      {row.sym}
                    </td>
                    <td className="px-4 py-3.5 text-center text-gray-600 dark:text-gray-400">
                      {row.fp}
                    </td>
                    <td className="px-4 py-3.5 text-center text-gray-600 dark:text-gray-400">
                      {row.seq}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center text-gray-400 dark:text-gray-600 text-xs mt-4">
            ✅ Full support &nbsp;⚠️ Partial / limited &nbsp;❌ Not available &nbsp;— Competitor data based on publicly available specifications.
          </p>
        </motion.div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-br from-[#0b0c1b] to-[#0f2044] text-white">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="container mx-auto px-4 text-center"
        >
          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-light mb-4"
            style={{ fontFamily: "Whyte, sans-serif" }}
          >
            Ready to protect your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
              sensitive data?
            </span>
          </h2>
          <p className="text-white/70 max-w-3xl mx-auto text-base md:text-lg mb-8">
            11-channel monitoring, 50+ data types, native India DPDP Act 2023 compliance, and
            tamper-evident audit trails — all in a single lightweight agent.
          </p>

          <div className="flex flex-wrap gap-4 justify-center mb-10">
            {[
              "11 Monitoring Channels",
              "50+ Data Types",
              "DPDP Act 2023 Native",
              "Tamper-Evident Audit Trail",
              "Hash-Chained Records",
              "31 Policy Templates",
            ].map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-xs"
              >
                <CheckCircle2 size={12} className="text-cyan-400" />
                {tag}
              </span>
            ))}
          </div>

          <motion.button
            onClick={() => navigate("/contact-us")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="relative flex items-center gap-2 mx-auto rounded-full px-8 py-3.5 font-semibold
              text-white border border-white/40 bg-[#4483f9] hover:bg-[#5a94ff] overflow-hidden transition-colors"
          >
            <span>Request a Demo</span>
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </section>
    </div>
  );
};

export default XyberguardDLP;
