import {
  ArrowRight,
  Settings,
  Search,
  Cog,
  Eye,
  FileText,
  LayoutDashboard,
  BarChart3,
  Puzzle,
  Cpu,
  RefreshCcw,
} from "lucide-react";
import featureImg from "../assets/images/features.png";
import { motion, Variants, easeOut } from "framer-motion";
import servicesImage from "@/assets/images/certaxis.jpg";
import lifecycle from "../assets/images/lifecycle.png";
import howitworks from "../assets/images/howitworks.png";
import { useTheme } from "next-themes";
import { ShieldAlert, FileCheck, Monitor, Lock } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import React from "react";
// Animation Variants
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

const cardHover: Variants = {
  rest: { scale: 1, rotate: 0 },
  hover: { scale: 1.05, rotate: 1, transition: { type: "spring", stiffness: 200 } },
};
const stepsf = [
  {
    number: "01",
    title: "Upload Your Documents",
    description:
      "Simply upload your documents through our intuitive interface using the Batch Import feature.",
  },
  {
    number: "02",
    title: "Search & Collaborate",
    description:
      "Find any document instantly and collaborate with your team in real-time with comments and edits.",
  },
  {
    number: "03",
    title: "Access Management",
    description:
      "Set up user roles and permissions to control who can view, edit, or share your documents.",
  },
  {
    number: "04",
    title: "Workflow Automation",
    description:
      "Streamline document approvals, reviews, and routing with customizable workflows tailored to your business needs.",
  },
];


const stepn = [
  {
    id: 1,
    color: "from-teal-500 to-green-600",
    icon: <RefreshCcw size={28} className="text-white" />,
    title: "Certificate Auto-Renewal",
    description:
      "Automatically renew expiring certificates to eliminate downtime, reduce risk, and maintain continuous trust.",
  },

  {
    id: 2,
    color: "from-blue-500 to-cyan-500",
    icon: <BarChart3 size={28} className="text-white" />,
    title: "Ownership & Reporting",
    description:
      "Assign ownership, generate detailed reports, and trigger alerts to maintain governance and accountability.",
  },
  {
    id: 3,
    color: "from-sky-500 to-blue-700",
    icon: <Settings size={28} className="text-white" />,
    title: "Standardized Policies",
    description:
      "Enforce consistent policies and processes to ensure secure, compliant certificate deployment and management.",
  },
  {
    id: 4,
    color: "from-indigo-800 to-slate-900",
    icon: <Lock size={28} className="text-white" />,
    title: "Custom Lifecycle Management",
    description:
      "Adapt lifecycle workflows to match your organization’s security requirements and operational framework.",
  },
  {
    id: 5,
    color: "from-green-500 to-emerald-700",
    icon: <Puzzle size={28} className="text-white" />,
    title: "Self-Service Access",
    description:
      "Provide delegated, role-based access for application owners and admins to simplify operations and reduce IT overhead.",
  },
  {
    id: 6,
    color: "from-purple-500 to-pink-600",
    icon: <Cpu size={28} className="text-white" />,
    title: "Automated Workflows",
    description:
      "Integrate automation to streamline certificate operations, eliminate manual errors, and strengthen security posture.",
  },
  {
    id: 7,
    color: "from-orange-500 to-red-500",
    icon: <Search size={28} className="text-white" />,
    title: "Comprehensive Discovery",
    description:
      "Identify all machine identities across your infrastructure for complete visibility into cryptographic assets.",
  },
];

const points = [
  {
    id: 1,
    title: "Enhanced Security and Regulatory Compliance",
    desc: `
  • Proactively identify vulnerabilities to minimize potential threats  
  • Streamline adherence to security and compliance standards  
  • Facilitate comprehensive audit trails and reporting capabilities  
  • Maintain cryptographic flexibility to adapt to evolving encryption standards
    `,
  },

  {
    id: 2,
    title: "Automation for Efficiency and Cost Optimization",
    desc: `
  • Automate and centralize certificate lifecycle management processes  
  • Reclaim up to 1.5 hours of operational time per day through workflow automation  
  • Achieve up to 24% cost reduction via event-driven orchestration and process optimization
    `,
  },
  {
    id: 3,
    title: "Strengthened Competitiveness and Innovation",
    desc: `
  • Secure emerging device ecosystems to enable advanced smart applications  
  • Foster seamless collaboration by eliminating IT security constraints  
  • Reallocate IT resources toward strategic initiatives and innovation
    `,
  },

];


const steps = [
  {
    icon: Search,
    title: "Automated Discovery & Compliance",
    desc: `• Continuously scans networks for SSL/TLS certificates  
  • Detects certificates across directories, key stores, and connected assets`,
  },
  {
    icon: Eye,
    title: "Centralized Visibility Across CAs",
    desc: `• Integrates with multiple CAs for unified oversight  
  • Connects with major providers like Let’s Encrypt, DigiCert, and Nexus GO`,
  },
  {
    icon: Cog,
    title: "Smart Automation for Lifecycle Management",
    desc: `• Automates issuance, renewal, and revocation  
  • Manages keys and certificates across systems and devices  
  • Supports event-based and scheduled actions`,
  },
];


const sections = [
  {
    icon: <Settings className="w-8 h-8 text-cyan-400" />,
    title: "User-Friendly Web Portal",
    points: [
      "Enable manual certificate management through an intuitive interface.",
      "Securely manage certificate templates, policies, automation workflows, and CA connectors with full audit traceability.",
    ],
  },
  {
    icon: <FileText className="w-8 h-8 text-cyan-400" />,
    title: "Comprehensive Logging & Reporting",
    points: [
      "Capture and store detailed audit logs for all certificate lifecycle activities.",
      "Generate flexible, on-demand reports for certificate usage, status, and billing-related key data.",
    ],
  },
  {
    icon: <LayoutDashboard className="w-8 h-8 text-cyan-400" />,
    title: "Centralized Dashboard",
    points: [
      "Gain unified visibility into certificate inventories, algorithms, and lifecycle states.",
      "Monitor compliance posture and proactively identify potential security risks.",
    ],
  },
];


const feat = [
  {
    icon: ShieldAlert,
    title: "Prevent Downtime",
    desc: "Xyberguard-CLM automates renewals and revocations to avoid outages and maintain continuous trust.",
  },
  {
    icon: FileCheck,
    title: "Ensure Compliance",
    desc: "Stay audit-ready with automated tracking and updates aligned with ISO, SOC 2, GDPR, and NIS2 standards.",
  },
  {
    icon: Monitor,
    title: "Centralized Visibility",
    desc: "Gain unified control of all certificates with real-time monitoring and simplified lifecycle management.",
  },
  {
    icon: Lock,
    title: "Reinforce Security",
    desc: "Continuously detect and replace weak or expired certificates to close potential security gaps.",
  },
];




const CLMDashboardMockup = () => (
  <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#0d1117] font-mono text-xs select-none">
    {/* Title bar */}
    <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-white/10">
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
      </div>
      <span className="text-white/40 text-[11px] tracking-wide">Xyberguard-CLM — Certificate Dashboard</span>
      <div className="w-14" />
    </div>

    {/* Stats row */}
    <div className="grid grid-cols-4 gap-px bg-white/5 border-b border-white/10">
      {[
        { label: "Total Certs", value: "1,247", color: "text-cyan-400" },
        { label: "Compliance", value: "94.3%", color: "text-emerald-400" },
        { label: "Expiring Soon", value: "23", color: "text-orange-400" },
        { label: "Active CAs", value: "8", color: "text-blue-400" },
      ].map((s) => (
        <div key={s.label} className="bg-[#0d1117] px-3 py-3 flex flex-col gap-0.5">
          <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
          <span className="text-white/40 text-[10px] uppercase tracking-wider">{s.label}</span>
        </div>
      ))}
    </div>

    {/* Certificate inventory */}
    <div className="px-4 py-3 border-b border-white/10">
      <div className="text-white/30 text-[10px] uppercase tracking-widest mb-2">Certificate Inventory</div>
      {[
        { type: "SSL/TLS", algo: "RSA-2048", expiry: "2026-03-12", status: "VALID" },
        { type: "Code Signing", algo: "ECDSA P-256", expiry: "2025-12-01", status: "EXPIRING" },
        { type: "Email (S/MIME)", algo: "RSA-4096", expiry: "2026-08-20", status: "VALID" },
        { type: "Document Sign", algo: "ECDSA P-384", expiry: "2025-11-15", status: "EXPIRING" },
        { type: "Device Auth", algo: "RSA-2048", expiry: "2027-01-30", status: "VALID" },
      ].map((c, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              c.status === "VALID" ? "bg-emerald-400" : "bg-orange-400"
            }`} />
            <span className="text-white/80 text-[11px]">{c.type}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/30 text-[10px]">{c.algo}</span>
            <span className="text-white/40 text-[10px]">{c.expiry}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
              c.status === "VALID"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-orange-500/20 text-orange-400"
            }`}>{c.status}</span>
          </div>
        </div>
      ))}
    </div>

    {/* Automation status */}
    <div className="px-4 py-3">
      <div className="text-white/30 text-[10px] uppercase tracking-widest mb-2">Automation Pipeline</div>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          ["Auto-Renewal", "active"], ["CA Integration", "active"],
          ["Policy Enforcement", "active"], ["Expiry Alerts", "active"],
          ["ACME Protocol", "active"], ["LDAP Sync", "active"],
        ].map(([ch]) => (
          <div key={ch} className="flex items-center gap-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-white/50 text-[10px]">{ch}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const CertAxis = () => {
  const navigate = useNavigate();
  const handleClick = () => {
    navigate("/contact-us");
  }
  const [activeId, setActiveId] = useState(1);
  const { theme } = useTheme();
  return (

    <div className={`transition-colors duration-500 ${theme === "dark" ? "dark" : ""}`}>
      {/* Hero Section */}
      <section
        className="relative min-h-[66vh] flex items-center justify-center overflow-hidden pt-40 pb-10 transition-colors duration-500"
        style={{
          backgroundImage: `url(${servicesImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "scroll",
          fontFamily: "'Whyte', sans-serif",
        }}
      >
        <style>
          {`
      /* Fix for smaller screens to prevent zoom-in */
      @media (max-width: 720px) {
        section[style] {
          background-position: top center !important;
          background-size: 170% auto !important; /* Show more area, less zoom */
        }
      }

      @media (max-width: 480px) {
        section[style] {
          background-size: 190% auto !important; /* Slightly tighter framing */
          background-position: top center !important;
        }
      }
    `}
        </style>

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/80 dark:bg-black/90"></div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInLeft}
            className="space-y-2 sm:space-y-8 flex flex-col items-center justify-center text-center mobile-padding"
          >
            {/* Header */}
            <h1
              className="font-normal leading-tight max-w-6xl text-white dark:text-gray-100
                 text-[20px] sm:text-[28px] md:text-[55px] md:leading-[1.1]"
              style={{ fontWeight: 400 }}
            >
              <span className="text-white relative">
                <span className="absolute inset-0 blur-md text-cyan-400 opacity-60">
                  Xyberguard-CLM
                </span>
                <span className="relative text-cyan-300">Xyberguard-CLM</span>
              </span>{" "}
              <span className="text-white/90 dark:text-gray-300">
                Centralized PKI Lifecycle Automation
              </span>
            </h1>

            {/* Paragraph */}
            <p
              className="max-w-4xl mx-auto text-white/90 dark:text-gray-300
                 text-[13px] sm:text-[16px] md:text-[24px] leading-relaxed mobile-p"
              style={{ fontWeight: 300 }}
            >
              Safeguard your organization from cyber risks with our cutting-edge web
              application penetration testing and vulnerability assessment solutions.
            </p>

            {/* Button */}
            <motion.button
              onClick={handleClick}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="relative flex items-center justify-center gap-2 sm:gap-3 rounded-full
                 px-4 sm:px-6 py-2 sm:py-3 font-semibold text-white
                 text-xs sm:text-sm md:text-base border border-white/50 bg-transparent 
                 overflow-hidden group transition-all"
            >
              <span className="absolute inset-0 bg-[#4483f9] scale-x-0 group-hover:scale-x-100 origin-right transition-transform duration-300 ease-out" />
              <span className="relative z-10">Get In Touch</span>
              <div className="relative z-10 bg-[#4483f9] rounded-full p-1 sm:p-1.5 transition-transform duration-300 group-hover:scale-110">
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-white" />
              </div>
            </motion.button>
          </motion.div>
        </div>

      </section>


      {/* What is Web App Pentest */}
      <section
        className="w-full px-2 sm:px-4 md:px-6 py-10 sm:py-16 md:py-20 lg:py-12 relative overflow-hidden transition-colors duration-500 bg-[#f8f7f4] dark:bg-[#0b0c1b]"
        style={{
          backgroundImage: `url(${lifecycle})`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundBlendMode: "overlay",
        }}
      >
        {/* Header Section */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="text-center flex flex-col items-center justify-center mx-auto mb-8 sm:mb-10 px-2 sm:px-4"
        >
          <div
            className="text-[10px] sm:text-xs md:text-sm font-semibold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 uppercase mb-2 sm:mb-3"
            style={{ fontFamily: "'Whyte', sans-serif", fontWeight: 600 }}
          >
            Xyberguard-CLM CERTIFICATE MANAGER
          </div>

          <div className="relative inline-block">
            <h2
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#0b0c1b] dark:text-white transition-colors duration-500"
              style={{ fontFamily: "Whyte, sans-serif", lineHeight: "1.1" }}
            >
              What we offer
            </h2>
            <span className="absolute left-1/2 -bottom-2 w-3/6 h-[3px] bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 transform -translate-x-1/2 rounded-full"></span>
          </div>

          <p
            className="text-gray-700 dark:text-gray-300 text-sm sm:text-base md:text-lg leading-relaxed max-w-3xl text-center px-1 sm:px-0"
            style={{ fontFamily: "'Whyte', sans-serif", fontWeight: 400 }}
          >

          </p>
        </motion.div>

        {/* Content Grid */}
        <section className="w-full py-8 sm:py-14 md:py-20 lg:py-8 transition-colors duration-500">
          <div className="container mx-auto px-2 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-12 items-center">
              {/* LEFT SIDE CONTENT */}

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeInLeft}
                className="space-y-8 sm:space-y-10 w-full max-w-2xl mx-auto"
              >
                {/* Numbered Points (no vertical line) */}
                <div className="space-y-6 sm:space-y-8 pl-1 sm:pl-2 relative">
                  {points.map((item) => (
                    <div key={item.id} className="relative">
                      <div
                        onClick={() => setActiveId(item.id)}
                        className="flex items-start gap-3 sm:gap-4 cursor-pointer group"
                      >
                        {/* Number Circle */}
                        <div
                          className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs sm:text-sm transition-all duration-300 ${activeId === item.id
                              ? "bg-[#0B57D0] dark:bg-blue-500 scale-110"
                              : "bg-black dark:bg-gray-700"
                            }`}
                        >
                          {item.id}
                        </div>

                        {/* Title */}
                        <h5
                          className={`text-[15px] sm:text-[18px] transition-colors duration-300 ${activeId === item.id
                              ? "text-[#0B57D0] dark:text-blue-400"
                              : "text-gray-800 dark:text-gray-200 group-hover:text-blue-500"
                            }`}
                          style={{ fontFamily: "'Whyte', sans-serif" }}
                        >
                          {item.title}
                        </h5>
                      </div>

                      {/* Description (Smooth Animated) */}
                      <motion.div
                        initial={false}
                        animate={{
                          height: activeId === item.id ? "auto" : 0,
                          opacity: activeId === item.id ? 1 : 0,
                        }}
                        transition={{
                          duration: 0.5,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                        className="overflow-hidden relative ml-10 sm:ml-12 mt-2"
                      >
                        <div className="flex flex-col relative pb-2">
                          <ul
                            className="text-gray-600 dark:text-gray-400 text-[14px] sm:text-[15px] leading-snug list-disc pl-4 space-y-1"
                            style={{ fontFamily: "'Whyte', sans-serif" }}
                          >
                            {item.desc
                              .trim()
                              .split("•")
                              .filter((line) => line.trim() !== "")
                              .map((line, index) => (
                                <li key={index}>{line.trim()}</li>
                              ))}
                          </ul>

                          {/* Animated Vertical Line inside active item */}
                          {activeId === item.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "100%", opacity: 1 }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                              className="absolute right-[-20px] sm:right-[-24px] top-[-28px] w-[2px] sm:w-[3px] h-[calc(100%+32px)] bg-[#083b99] dark:bg-blue-600 rounded-full opacity-95"
                            />
                          )}
                        </div>
                      </motion.div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* RIGHT SIDE IMAGE */}
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeInRight}
                className="flex justify-center w-full max-w-2xl mx-auto px-2 sm:px-0"
              >
                <CLMDashboardMockup />
              </motion.div>
            </div>
          </div>
        </section>

      </section>



      <section className="py-20 px-3 sm:px-6 md:px-16 bg-white dark:bg-[#0b0c1b] transition-colors duration-500">
        {/* Header */}
        <div className="text-center mb-6">
          <h2
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#0b0c1b] dark:text-white transition-colors duration-500"
            style={{ fontFamily: "Whyte, sans-serif", lineHeight: "1.1" }}
          >
            How does CLM work?
          </h2>
          <p className="text-gray-600 dark:text-gray-300 max-w-4xl mx-auto mt-4 text-base md:text-lg transition-colors duration-500">
            Xyberguard-CLM centralizes PKI management with secure certificate issuance, monitoring, and renewal—bringing automation, compliance, and control to your entire certificate ecosystem.
          </p>
        </div>

        {/* Main Content Section */}
        <div className="container mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center">
          {/* Left Image */}
          <div className="flex justify-center lg:justify-end">
            <img
              src={howitworks}
              alt="How CLM Works"
              className="w-[95%] sm:w-[90%] md:w-[85%] lg:w-[110%] xl:w-[120%] max-w-none  hover:scale-[1.03] transition-transform duration-500 ease-out"
            />
          </div>

          {/* Right Content */}
          <div className="space-y-10 text-left px-2 sm:px-4 md:px-0">
            {steps.map((step, index) => (
              <div key={index} className="group">
                <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-3 transition-colors duration-500">
                  <step.icon
                    className="text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300"
                    size={26}
                  />
                  {step.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base leading-relaxed transition-colors duration-500">
                  {step.desc}
                </p>
                <div className="mt-3 h-[3px] bg-gradient-to-r from-blue-500 to-green-400 w-28 rounded-full transition-all duration-300 group-hover:w-36"></div>
              </div>
            ))}
          </div>
        </div>
      </section>


      <section
        className="py-12  text-gray-900 dark:bg-[#0b0c1b] dark:text-gray-200 relative overflow-hidden"
        style={{
          backgroundImage: `url(${featureImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Optional overlay for better readability */}


        <div className="max-w-7xl mx-auto px-6 md:px-1 relative z-10">
          {/* Header */}
          <div className="text-center mb-10 relative">
            <h2
              className="relative inline-block text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#0b0c1b] dark:text-white transition-colors duration-500"
              style={{ fontFamily: "Whyte, sans-serif", lineHeight: "1.1" }}
            >
              Key features
              <span className="absolute left-1/2 -bottom-4 w-3/6 h-[3px] bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 transform -translate-x-1/2 rounded-full"></span>
            </h2>

            <p className="max-w-4xl mx-auto text-base md:text-2xl  text-gray-600 dark:text-gray-400 mt-6">
              to securely manage and govern machine identities across your infrastructure
            </p>
            <p className="max-w-3xl mx-auto mt-4 text-gray-600 dark:text-gray-400">
              Machine identities enable authentication and encryption across applications, servers, and devices. With centralized visibility and automated lifecycle management, organizations can keep them secure, compliant, and disruption-free.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-10 justify-items-center">
  {stepn.map((step) => (
    <div key={step.id} className="relative group">
      {/* Colored shadow card */}
      <div
        className={`absolute bottom-0 left-0 w-[98%] h-[95%] translate-x-[-8px] translate-y-[8px] bg-gradient-to-r ${step.color} rounded-tr-[3rem] rounded-bl-[3rem] opacity-90 transition-transform duration-500 group-hover:translate-x-[-5px] group-hover:translate-y-[5px]`}
      ></div>

      {/* Main white card */}
      <div className="relative bg-white rounded-tr-[3rem] rounded-bl-[3rem] shadow-lg border border-gray-100 text-center p-8 transition-transform duration-500 group-hover:scale-[1.02] overflow-visible min-h-[220px] flex flex-col">
        {/* Floating icon */}
        <div
          className={`absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-r ${step.color} shadow-lg border-4 border-white z-10`}
        >
          {step.icon}
        </div>

        {/* Card content */}
        <div className="flex flex-col flex-grow justify-center mt-6">
          <h3
            className={`text-xl font-semibold bg-gradient-to-r ${step.color} bg-clip-text text-transparent mb-4`}
          >
            {step.title}
          </h3>

          <p className="text-gray-600 text-sm leading-relaxed px-2 flex-grow flex items-center justify-center">
            {step.description}
          </p>
        </div>
      </div>
    </div>
  ))}
</div>


        </div>
      </section>

    </div>
  );
};

export default CertAxis;
