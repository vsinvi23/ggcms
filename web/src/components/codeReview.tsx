import { ArrowRight, Globe, ShieldOff, Server, Database, BrainCircuit, Code } from "lucide-react";
import { motion, Variants } from "framer-motion";
import React from "react";
import { Lock } from "lucide-react";
import { ShieldCheck, Target, Search, Zap } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import servicesImage from "@/assets/images/secure_code.jpg";
import { MethodologyStep } from "./MethodologyStep";
import { useNavigate } from "react-router-dom";

const vulnerabilities = [
  {
    id: 1,
    title: "SQL Injection",
    description:
      "Improper database queries allow attackers to inject malicious SQL, access confidential data, or manipulate your database server.",
    alert: "Even one weak query can expose your entire database.",
    icon: Database,
  },
  {
    id: 2,
    title: "Cross-Site Scripting (XSS)",
    description:
      "Malicious scripts injected into web pages can steal sessions, redirect users, or deface your site — all without direct server access.",
    alert: "XSS remains one of the most exploited web vulnerabilities.",
    icon: Code,
  },
  {
    id: 3,
    title: "Authentication Flaws",
    description:
      "Weak validation, insecure passwords, or poor session control can let attackers impersonate users or access restricted areas.",
    alert: "Authentication issues are a top cause of unauthorized access.",
    icon: Lock,
  },
  {
    id: 4,
    title: "Business Logic Errors",
    description:
      "Workflow oversights can let users bypass steps like payment or authorization checks, causing financial or data exposure risks.",
    alert: "Logic flaws are subtle but often lead to major impact.",
    icon: BrainCircuit,
  },
];

const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8 } }
};

const processSteps = [
  {
    id: 1,
    title: "Initial Code Assessment",
    description:
      "We scan your codebase with advanced tools to detect potential security gaps and weak spots early.",
    icon: Search,
  },
  {
    id: 2,
    title: "Contextual Review",
    description:
      "Experts manually analyze business logic and workflows to confirm findings and uncover hidden flaws.",
    icon: Server,
  },
  {
    id: 3,
    title: "Collaborative Testing",
    description:
      "Our pentesters and developers simulate real-world attack scenarios to expose complex vulnerabilities.",
    icon: Target,
  },
  {
    id: 4,
    title: "Validation & Reporting",
    description:
      "We consolidate insights, validate results, and deliver prioritized, actionable remediation guidance.",
    icon: ShieldCheck,
  },
];
const codeReview: React.FC = () => {
  const navigate = useNavigate();
  const handleClick = () => {
    navigate("/contact-us");
  };
  return (
    <div className="min-h-screen bg-[#0e1220] text-slate-100">
      {/* HERO */}
      <section
        className="relative  h-[50vh]  flex items-center justify-center overflow-hidden transition-colors duration-500"
        style={{
          backgroundImage: `url(${servicesImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          fontFamily: "'Whyte', sans-serif",

        }}
      >

        {/* Optional dark overlay for contrast */}
        <div className="absolute inset-0 bg-black/80"></div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInLeft}
            className="space-y-3 flex flex-col items-center justify-center text-center"
          >
            {/* Header */}
            <h1
              className="font-normal leading-tight max-w-6xl text-white dark:text-gray-100
                 text-[24px] sm:text-[28px] md:text-[52px] md:leading-[1.1]"
              style={{
                fontWeight: 400,
                lineHeight: "1.1",
              }}
            >
              Secure, production-ready <span style={{ color: "#ffffff" }}>code</span>
            </h1>

            {/* Paragraph */}
            <p
              className="max-w-3xl mx-auto text-white/90"
              style={{
                fontWeight: 300,
                fontSize: "24px",
                lineHeight: "32px",
              }}
            >
              Find and fix vulnerabilities early with secure code reviews for faster, more reliable software delivery.
            </p>

            {/* Button */}
            <motion.button
              onClick={handleClick}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="relative flex items-center justify-center gap-3 rounded-full px-5 sm:px-6 py-2.5 sm:py-3 font-semibold text-white text-sm sm:text-base border border-white/50 bg-transparent overflow-hidden group transition-all"
            >
              <span className="absolute inset-0 bg-[#4483f9] scale-x-0 group-hover:scale-x-100 origin-right transition-transform duration-300 ease-out" />
              <span className="relative z-10">Get In Touch</span>
              <div className="relative z-10 bg-[#4483f9] rounded-full p-1.5 transition-transform duration-300 group-hover:scale-110">
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </motion.button>
          </motion.div>
        </div>

      </section>

      <section
        className="relative w-full px-6 sm:px-4 py-[2rem] overflow-hidden transition-colors duration-500
             bg-gradient-to-br from-[#cdc0b1] via-[#e0d7c7] to-[#f5f2ed]
             dark:bg-gradient-to-br dark:from-[#0f172a] dark:via-[#0a1220] dark:to-[#111827]"
      >
        {/* Decorative floating circles */}
        <div className="absolute -top-32 -left-32 w-72 h-72 
                  bg-blue-300/20 dark:bg-blue-900/20 
                  rounded-full blur-3xl animate-pulse"></div>

        <div className="absolute -bottom-24 -right-24 w-96 h-96 
                  bg-cyan-300/20 dark:bg-cyan-900/20 
                  rounded-full blur-3xl animate-pulse"></div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          viewport={{ once: true }}
          className="relative z-10 container mx-auto max-w-6xl text-center px-4 sm:px-0"
          style={{ fontFamily: "'Whyte', sans-serif" }}
        >
          {/* Subheading with gradient text */}
          <div className="text-[12px] sm:text-lg md:text-xl font-semibold text-transparent 
                    bg-clip-text bg-gradient-to-r from-[#4483f9] to-[#1a5de8] 
                    mb-4 uppercase tracking-widest">
            Secure Code Review
          </div>

          {/* Responsive Main Heading */}
          <h2 className="mb-8 text-4xl sm:text-3xl md:text-4xl lg:text-[40px] leading-snug 
                   text-[#0b0c1b] dark:text-white">
            Overview
          </h2>

          {/* Paragraph with highlighted spans */}
          <p className="text-base sm:text-lg md:text-xl leading-relaxed max-w-4xl mx-auto 
                  text-gray-700 dark:text-gray-300">
            Identify and remediate vulnerabilities early with our{" "}
            <span className="font-semibold text-black dark:text-white">Secure Code Review</span> service.
            By blending intelligent automation with expert human analysis, we uncover
            hidden weaknesses in your source code. Using{" "}
            <span className="text-blue-500 dark:text-blue-400 font-medium">OWASP-aligned methodologies</span>,
            we help ensure your applications remain secure at every stage of development—
            empowering your team to deploy with confidence and protect critical assets.
          </p>

          {/* Decorative gradient divider */}
          <div className="mt-12 mx-auto w-24 h-1 
                    bg-gradient-to-r from-blue-400 to-cyan-400 
                    dark:from-blue-500 dark:to-cyan-500 
                    rounded-full animate-pulse"></div>
        </motion.div>
      </section>


      <section className="relative w-full bg-gradient-to-br from-[#0A1442] via-[#0C174A] to-[#0F1B4C] py-24 text-white overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute inset-0">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/20 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-blue-400/10 rounded-full blur-[120px]"></div>
        </div>

        <div className="max-w-6xl mx-auto px-6 text-center relative z-10">
          <h3 className="text-3xl md:text-4xl font-extrabold mb-16 tracking-tight">
            Challenges Engineering Teams Face
          </h3>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* Card 1 */}
            <div className="group bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-lg shadow-blue-900/40 hover:shadow-blue-500/30 hover:-translate-y-2 transition-all duration-500">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-5 bg-blue-600/30 rounded-xl border border-blue-400/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m2 0a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v3a2 2 0 002 2zm2 0v7m0 0h3m-3 0H9" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold mb-3">Post-release patches impacting delivery?</h4>
              <p className="text-gray-300 text-sm leading-relaxed">
                Addressing vulnerabilities after production increases cost, complexity, and dev cycle friction.
              </p>

            </div>

            {/* Card 2 */}
            <div className="group bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-lg shadow-blue-900/40 hover:shadow-blue-500/30 hover:-translate-y-2 transition-all duration-500">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-5 bg-blue-600/30 rounded-xl border border-blue-400/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold mb-3">Maintain speed without compromising security</h4>
              <p className="text-gray-300 text-sm leading-relaxed">
                Deliver faster while upholding rigorous security standards throughout development.
              </p>
            </div>

            {/* Card 3 */}
            <div className="group bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-lg shadow-blue-900/40 hover:shadow-blue-500/30 hover:-translate-y-2 transition-all duration-500">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-5 bg-blue-600/30 rounded-xl border border-blue-400/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 1.343-3 3 0 1.166.621 2.182 1.553 2.707l-.895 3.577a1 1 0 001.281 1.182l3.382-.846a1 1 0 00.764-.953V11a3 3 0 00-3-3z" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold mb-3">Shift security left</h4>
              <p className="text-gray-300 text-sm leading-relaxed">
                Integrate testing early in the SDLC to detect vulnerabilities before they escalate.
              </p>
            </div>

            {/* Card 4 */}
            <div className="group bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-lg shadow-blue-900/40 hover:shadow-blue-500/30 hover:-translate-y-2 transition-all duration-500">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-5 bg-blue-600/30 rounded-xl border border-blue-400/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold mb-3">Reduce remediation costs</h4>
              <p className="text-gray-300 text-sm leading-relaxed">
                Addressing vulnerabilities pre-release minimizes costly production fixes.
              </p>

            </div>
          </div>
        </div>
      </section>



      <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-[2rem] text-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-cyan-400 font-semibold uppercase tracking-wide">
            Benefits
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] font-bold mt-2 mb-4">
            Strengthen Your Code from the Inside Out
          </h2>
          <p className="text-gray-300 max-w-3xl mx-auto text-lg leading-relaxed mb-16">
            Get complete visibility into your application’s security — combining automation, expert review,
            and proven frameworks to detect and fix vulnerabilities before release.
          </p>

          <div className="grid md:grid-cols-3 gap-10">
            {/* Card 1 */}
            <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/20 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9 6 9-6-9-4-9 4zm0 10l9 4 9-4M3 7v10m18-10v10" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">In-Depth Code Intelligence</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Leverage static analysis and dependency scans to reveal hidden risks and gain clear insight
                into your code’s security health.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl p-8 rounded-2xl border border-white/20 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.105.895-2 2-2h4v10H6V9h4c1.105 0 2 .895 2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Expert Manual Validation</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Our specialists manually review code to detect logic flaws and confirm the real impact of automated findings.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/20 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m2 0a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v3a2 2 0 002 2zm2 0v7m0 0h3m-3 0H9" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Framework-Backed Security Reviews</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Following OWASP-aligned standards, we deliver consistent, in-depth reviews that expose
                architectural flaws often missed by automated tools.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-20 text-white">
        {/* Header Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center mb-16">
          <p className="text-cyan-400 font-semibold uppercase tracking-wide">
            Vulnerability Types
          </p>
          <h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] text-white mt-2"
            style={{
              fontFamily: "'Whyte', sans-serif",
              lineHeight: "1.3",
            }}
          >
            Common Weaknesses That Leave Systems Exposed
          </h2>
          <p
            className="mt-4 text-gray-300 max-w-2xl mx-auto text-lg leading-relaxed"
            style={{
              fontFamily: "'Whyte', sans-serif",
            }}
          >
            Discover key coding and architectural flaws that attackers target — and fix them early through proactive reviews.
          </p>
        </div>

        {/* Cards Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto w-full px-6">
          {vulnerabilities.map((vuln) => {
            const Icon = vuln.icon;
            return (
              <Card
                key={vuln.id}
                className="w-full rounded-2xl shadow-lg hover:shadow-2xl transition transform hover:-translate-y-2 p-8 bg-white/10 backdrop-blur-lg border border-white/20"
              >
                <div className="flex flex-col text-left space-y-4 w-full">
                  {/* ✅ Icon and Title in One Line */}
                  <div className="flex items-center gap-4">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white flex-shrink-0">
                      <Icon size={28} />
                    </div>
                    <h3
                      className="text-xl leading-tight"
                      style={{
                        fontFamily: "'Whyte', sans-serif",
                        fontWeight: 300,
                        color: "rgb(255, 255, 255)",
                      }}
                    >
                      {vuln.title}
                    </h3>
                  </div>

                  <p
                    className="text-sm leading-relaxed"
                    style={{
                      fontFamily: "'Whyte', sans-serif",
                      fontWeight: 400,
                      color: "#b5c4e3",
                    }}
                  >
                    {vuln.description}
                  </p>

                  <CardContent
                    className="rounded-xl mt-4 p-3 flex items-start gap-2"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      color: "rgb(255 146 110)",
                      fontFamily: "'Whyte', sans-serif",
                      fontSize: "14px",
                    }}
                  >
                    <AlertTriangle
                      size={18}
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: "rgb(255 146 110)" }}
                    />
                    <span>{vuln.alert}</span>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section
        className="relative w-full py-[2rem] px-6  overflow-hidden transition-colors duration-500 text-gray-900 dark:text-white"
        style={{ fontFamily: "'Whyte', sans-serif" }}
      >
        {/* Backgrounds */}
        <div
          className="absolute inset-0 transition-all duration-500"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, #f5f8ff 0%, #eaf1ff 100%)",
          }}
        ></div>
        <div className="absolute inset-0 dark:bg-[radial-gradient(circle_at_20%_20%,_#0b1124_0%,_#030712_100%)] transition-all duration-500"></div>

        {/* Glow accents */}
        <div className="absolute inset-0">
          <div className="absolute top-10 left-1/4 w-72 h-72 bg-blue-400/20 dark:bg-blue-600/20 rounded-full blur-[100px]" />
          <div className="absolute bottom-10 right-1/4 w-72 h-72 bg-cyan-300/20 dark:bg-cyan-400/20 rounded-full blur-[120px]" />
        </div>

        {/* Header */}
        <div className="relative z-10 text-center mb-20">
          <p className="uppercase tracking-[0.3em] text-blue-500 dark:text-cyan-400 text-sm font-semibold">
            Our Approach
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] leading-tight bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-cyan-300 dark:to-blue-400 bg-clip-text text-transparent drop-shadow-[0_4px_10px_rgba(56,189,248,0.2)]">
            How We Secure Your Codebase
          </h2>
          <p className="max-w-2xl mx-auto mt-6 text-gray-700 dark:text-gray-300 text-base leading-relaxed">
            A unified process combining automation, manual review, and penetration testing to uncover and fix vulnerabilities early.
          </p>
        </div>

        {/* Step Cards (reusing MethodologyStep component) */}
        <div className="relative z-10 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 justify-items-center">
          {processSteps.map((step) => (
            <MethodologyStep
              key={step.id}
              number={step.id}
              title={step.title}
              description={step.description}
            />
          ))}
        </div>

        {/* Subtle particle overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-30 dark:opacity-20 bg-[radial-gradient(circle_at_center,_#ffffff_1px,_transparent_1px)] dark:bg-[radial-gradient(circle_at_center,_#1e293b_1px,_transparent_1px)] bg-[length:24px_24px]" />
      </section>



    </div>
  );
};

export default codeReview;
