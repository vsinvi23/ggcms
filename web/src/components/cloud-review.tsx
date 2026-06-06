
import { ArrowRight, CheckCircle, Cloud, ClipboardList, BarChart3, UserCheck, Database } from "lucide-react";
import { motion, Variants } from "framer-motion";
import heroProtection from '../assets/images/cloud.png';
import React from "react";
import { Shield, Lock, FileCheck, Activity } from "lucide-react";
import { ShieldCheck, Target, } from "lucide-react";
import { Wrench, AlertTriangle } from "lucide-react";
import servicesImage from "@/assets/images/cloud configuration.jpg";
import { MethodologyStep } from "./MethodologyStep";
import { useNavigate } from "react-router-dom";

const vulnerabilities = [
  {
    id: 1,
    title: "Authentication Weaknesses",
    description:
      "Weak or inconsistent authentication controls can let attackers bypass logins and access sensitive resources. We help enforce multi-factor authentication and strong access policies.",
    alert: "Over 60% of cloud intrusions stem from inadequate authentication mechanisms.",
    icon: Lock,
  },
  {
    id: 2,
    title: "Misconfigured Cloud Settings",
    description:
      "Even a single open bucket or exposed port can leak critical data. Our audits align configurations with industry benchmarks and least-privilege principles.",
    alert: "Roughly 70% of cloud environments contain at least one misconfiguration risk.",
    icon: ShieldCheck,
  },
  {
    id: 3,
    title: "Unpatched Vulnerabilities",
    description:
      "Outdated software and missed updates leave exploitable flaws. We help automate patch management and streamline updates to reduce exposure.",
    alert: "Nearly 40% of cloud-related breaches involve unpatched vulnerabilities.",
    icon: Wrench,
  },
  {
    id: 4,
    title: "Excessive Privileges",
    description:
      "Overly broad permissions increase your attack surface. We apply role-based access control (RBAC) to keep privileges aligned with operational needs.",
    alert: "Half of all cloud environments include accounts with unnecessary admin rights.",
    icon: UserCheck,
  },
  {
    id: 5,
    title: "Insufficient Logging & Monitoring",
    description:
      "Limited visibility allows threats to go unnoticed. We integrate advanced monitoring and alerting to detect and respond to incidents in real time.",
    alert: "About 30% of breaches remain undetected due to poor logging or alerting systems.",
    icon: Activity,
  },
  {
    id: 6,
    title: "Data Exposure Risks",
    description:
      "Misconfigured permissions or missing encryption can expose sensitive data. We ensure encryption at rest and in transit across your entire environment.",
    alert: "Around 25% of cloud storage setups inadvertently expose confidential data.",
    icon: Database,
  },
];


const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8 } }
};

const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8 } }
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8 } }
};

const cardHover: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1.03, transition: { type: "spring", stiffness: 220 } }
};

const testingTypes = [
  {
    icon: Cloud,
    title: "Cloud Configuration Review",
    description:
      "Evaluate your cloud environments against industry best practices and compliance frameworks to identify weak configurations, excessive permissions, and misaligned policies before they become security risks.",
    points: [
      "Comprehensive reviews across AWS, Azure, and GCP",
      "Identity and Access Management (IAM) validation",
      "Security assessments for serverless and containerized workloads",
    ],
  },
  {
    icon: Shield,
    title: "Cloud Penetration Testing",
    description:
      "Simulate realistic cyberattacks against your cloud workloads to uncover vulnerabilities, assess security controls, and validate the resilience of your cloud defenses.",
    points: [
      "External and internal infrastructure assessments",
      "Application and API layer attack simulations",
      "Encryption and data protection verification",
    ],
  },
  {
    icon: FileCheck,
    title: "Cloud Compliance Audits",
    description:
      "Verify that your cloud infrastructure adheres to leading regulatory and security standards through thorough assessments and actionable improvement plans.",
    points: [
      "Compliance validation for ISO 27001, GDPR, and PCI DSS",
      "Policy, control, and governance verification",
      "Detailed remediation guidance and best-practice alignment",
    ],
  },
];


const processSteps = [
  {
    id: 1,
    title: "Review Cloud Provider Policies",
    description:
      "Every major cloud provider—AWS, Azure, and GCP—enforces unique guidelines for penetration testing. We start by reviewing these policies and obtaining the necessary authorizations to ensure a fully compliant assessment.",
    icon: FileCheck,
  },
  {
    id: 2,
    title: "Define Assessment Scope",
    description:
      "In collaboration with your team, we establish clear testing objectives, define engagement boundaries, and identify critical cloud assets, services, and applications to be evaluated.",
    icon: ClipboardList,
  },
  {
    id: 3,
    title: "Conduct Controlled Testing",
    description:
      "Our specialists perform a blend of automated scans and manual testing to emulate real-world attack techniques, revealing vulnerabilities and validating the effectiveness of existing security controls.",
    icon: Target,
  },
  {
    id: 4,
    title: "Deliver Insights & Remediation Plan",
    description:
      "We categorize findings by severity and provide a comprehensive report that includes detailed analysis, actionable recommendations, and prioritized remediation guidance.",
    icon: BarChart3,
  },
];


const cloudReview: React.FC = () => {
  const navigate = useNavigate();
  const handleClick = () => {
    navigate("/contact-us");
  };
  return (
    <div className="min-h-screen bg-[#0e1220] text-slate-100">
      {/* HERO */}
      <section
        className="relative min-h-[62vh] flex items-center justify-center overflow-hidden pt-40 pb-10 transition-colors duration-500"
        style={{
          backgroundImage: `url(${servicesImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "scroll",
          fontFamily: "'Whyte', sans-serif",
        }}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/70"></div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-2">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInLeft}
            className="space-y-3 flex flex-col items-center justify-center text-center"
          >
            {/* Header */}
            <h1
              className="font-normal leading-tight max-w-4xl text-white text-xl sm:text-5xl md:text-[55px] md:leading-[1.1]"
              style={{
                fontWeight: 400,
                paddingTop: "6rem",
              }}
            >
              Secure Your{" "}
              <span className="text-white">Cloud Environments</span>
            </h1>

            {/* Paragraph */}
            <p
              className="max-w-3xl mx-auto text-white/90 text-base sm:text-lg md:text-[24px] leading-relaxed"
              style={{ fontWeight: 300 }}
            >
              Fortify your cloud infrastructure against modern threats with deep security testing and real-world attack simulations.

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

            {/* Stats Section */}
          </motion.div>
        </div>
      </section>


      <section
        className="w-full px-4 py-[2rem] lg:py-20 relative overflow-hidden transition-colors duration-500 
             bg-[rgb(205,192,177)] dark:bg-[#0f172a]"
      >
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left Text */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInLeft}
            >
              {/* Small Heading */}
              <div
                className="text-l font-semibold text-transparent bg-clip-text 
                     bg-gradient-to-r from-[#4483f9] to-[#1a5de8] mb-4"
                style={{
                  fontFamily: "'Whyte', sans-serif",
                  fontWeight: 600,
                }}
              >
                CLOUD SECURITY
              </div>

              {/* Main Heading */}
              <h2
                className="mb-6 text-2xl sm:text-3xl md:text-4xl lg:text-[40px] 
                     text-[#0b0c1b] dark:text-white"
                style={{
                  fontFamily: "'Whyte', sans-serif",
                  fontWeight: 300,
                  fontSize: "40px",
                  lineHeight: "43px",
                }}
              >
                What is Cloud Penetration Testing?
              </h2>

              {/* Description */}
              <p
                className="mb-8 text-[#5a5c76] dark:text-gray-300"
                style={{
                  fontFamily: "'Whyte', sans-serif",
                  fontWeight: 400,
                  fontSize: "18px",
                }}
              >
                A proactive security exercise designed to uncover vulnerabilities within your cloud setup before cybercriminals can exploit them.
                Cloud penetration testing involves evaluating applications, services, and configurations hosted on cloud providers such as AWS, Azure, and GCP.
                Our team conducts every assessment in accordance with cloud provider policies, ensuring safe and effective testing that strengthens your
                overall security posture.
              </p>

              {/* Features */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  {
                    icon: Shield,
                    title: "Proactive Defense",
                    desc: "Discover and fix security flaws before they can be exploited by attackers.",
                  },
                  {
                    icon: FileCheck,
                    title: "Regulatory Compliance",
                    desc: "Meet global security standards like ISO 27001, SOC 2, and GDPR with confidence.",
                  },
                  {
                    icon: Lock,
                    title: "Data Protection",
                    desc: "Safeguard sensitive data, ensure privacy, and preserve customer trust.",
                  },
                  {
                    icon: Activity,
                    title: "Business Continuity",
                    desc: "Reduce downtime risks and maintain consistent, secure operations.",
                  },
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="space-y-2"
                    style={{ fontFamily: "'Whyte', sans-serif" }}
                  >
                    <div className="flex items-center gap-2">
                      <item.icon className="w-5 h-5 text-[#4483f9]" />
                      <h3
                        className="text-[15px] text-[#0b0c1b] dark:text-white"
                        style={{
                          fontFamily: "'Whyte', sans-serif",
                          fontWeight: 300,
                        }}
                      >
                        {item.title}
                      </h3>
                    </div>

                    <p
                      className="text-[#5a5c76] dark:text-gray-300 text-[15px]"
                      style={{
                        fontFamily: "'Whyte', sans-serif",
                        fontWeight: 400,
                      }}
                    >
                      {item.desc}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right Image */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInRight}
              className="relative"
            >
              <img
                src={heroProtection}
                alt="Cloud Security Assessment"
                className="rounded-2xl w-full"
                style={{ boxShadow: "none", background: "transparent" }}
              />
            </motion.div>
          </div>
        </div>
      </section>


      <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-[2rem] text-white">
        {/* Header Section */}
        <div className="text-center mb-16 px-6">
          <p
            className="text-cyan-400 font-semibold uppercase tracking-wide"
            style={{ fontFamily: "'Whyte', sans-serif" }}
          >
            Our Services
          </p>
          <h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] font-bold text-white mt-2"
            style={{ fontFamily: "'Whyte', sans-serif" }}
          >
            Types of Cloud Security Testing
          </h2>
          <p
            className="mt-4 text-gray-300 max-w-3xl mx-auto text-lg leading-relaxed"
            style={{ fontFamily: "'Whyte', sans-serif" }}
          >
            Comprehensive cloud security assessments designed to fortify your infrastructure and protect your most critical data.
          </p>
        </div>

        {/* Cards Section */}
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testingTypes.map(({ icon: Icon, title, description, points }, index) => (
            <div
              key={index}
              className="bg-white/10 backdrop-blur-lg shadow-lg rounded-2xl p-6 border border-white/20 hover:shadow-2xl transition-all duration-300"
            >
              {/* Icon + Title on same line */}
              <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center">
                  <Icon className="text-white w-5 h-5" />
                </div>
                <h3
                  className="text-xl font-semibold text-white"
                  style={{ fontFamily: "'Whyte', sans-serif" }}
                >
                  {title}
                </h3>
              </div>

              {/* Description */}
              <p
                className="text-gray-300 mb-3 text-sm"
                style={{ fontFamily: "'Whyte', sans-serif" }}
              >
                {description}
              </p>

              {/* Points */}
              <ul className="space-y-1 text-sm">
                {points.map((point, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle className="text-green-400 w-4 h-4" />
                    <span
                      className="text-cyan-200"
                      style={{ fontFamily: "'Whyte', sans-serif" }}
                    >
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section
        className="relative w-full py-[2rem] px-6 overflow-hidden transition-colors duration-500 text-gray-900 dark:text-white"
        style={{ fontFamily: "'Whyte', sans-serif" }}
      >
        {/* 🌤️ Background */}
        <div
          className="absolute inset-0 transition-all duration-500"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, #f5f8ff 0%, #eaf1ff 100%)",
          }}
        ></div>
        <div className="absolute inset-0 dark:bg-[radial-gradient(circle_at_20%_20%,_#0b1124_0%,_#030712_100%)] transition-all duration-500"></div>

        {/* 💫 Glow accents */}
        <div className="absolute inset-0">
          <div className="absolute top-10 left-1/4 w-72 h-72 bg-blue-400/20 dark:bg-blue-600/20 rounded-full blur-[100px]" />
          <div className="absolute bottom-10 right-1/4 w-72 h-72 bg-cyan-300/20 dark:bg-cyan-400/20 rounded-full blur-[120px]" />
        </div>

        {/* 🧭 Header */}
        <div className="relative z-10 text-center mb-20">
          <p className="uppercase tracking-[0.3em] text-cyan-500 dark:text-cyan-400 text-sm font-semibold">
            Methodology
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] pb-1 mt-4 leading-tight bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-cyan-300 dark:to-blue-400 bg-clip-text text-transparent drop-shadow-[0_4px_10px_rgba(56,189,248,0.2)]">
            Our Approach to Cloud Security Testing
          </h2>
          <p className="max-w-2xl mx-auto mt-3 text-gray-700 dark:text-gray-300 text-base leading-relaxed">
            A structured and detailed methodology that provides a complete, transparent view of your cloud environment’s security posture.
          </p>
        </div>

        {/* 🧩 Step Cards */}
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

        {/* ✨ Subtle particle overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-30 dark:opacity-20 bg-[radial-gradient(circle_at_center,_#ffffff_1px,_transparent_1px)] dark:bg-[radial-gradient(circle_at_center,_#1e293b_1px,_transparent_1px)] bg-[length:24px_24px]" />
      </section>


      <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-[2rem] text-white">
        {/* Header Section */}
        <div className="text-center mb-16 px-6">
          <h4
            className="text-sm font-semibold uppercase tracking-wide mb-2 text-cyan-400"
            style={{ fontFamily: "'Whyte', sans-serif" }}
          >
            Security Insights
          </h4>
          <h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] font-extrabold text-white"
            style={{ fontFamily: "'Whyte', sans-serif" }}
          >
            Common Cloud Vulnerabilities
          </h2>
          <p
            className="mt-4 max-w-2xl mx-auto text-lg leading-relaxed text-gray-300"
            style={{ fontFamily: "'Whyte', sans-serif" }}
          >
            Identify prevalent weaknesses in cloud environments and mitigate them early to avoid breaches and service interruptions.
          </p>
        </div>

        {/* Cards Section */}
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {vulnerabilities.map((vuln) => {
            const Icon = vuln.icon;
            return (
              <div
                key={vuln.id}
                className="bg-white/10 backdrop-blur-lg shadow-lg rounded-2xl p-6 border border-white/20 hover:shadow-2xl transition-all duration-300"
              >
                {/* Icon + Title on same line */}
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center text-white">
                    <Icon size={24} />
                  </div>
                  <h3
                    className="text-lg font-semibold text-white"
                    style={{ fontFamily: "'Whyte', sans-serif" }}
                  >
                    {vuln.title}
                  </h3>
                </div>

                {/* Description */}
                <p
                  className="text-gray-300 mb-3 text-sm leading-relaxed"
                  style={{ fontFamily: "'Whyte', sans-serif" }}
                >
                  {vuln.description}
                </p>

                {/* Alert */}
                <div
                  className="text-sm rounded-xl mt-4 p-3 flex items-start gap-2"
                  style={{ color: "rgb(255, 146, 110)" }}
                >
                  <AlertTriangle
                    size={18}
                    className="mt-0.5 flex-shrink-0"
                    style={{ color: "rgb(255, 146, 110)" }}
                  />
                  <span style={{ fontFamily: "'Whyte', sans-serif" }}>{vuln.alert}</span>
                </div>


              </div>
            );
          })}
        </div>
      </section>


    </div>
  );
};

export default cloudReview;
