import { ArrowRight, Globe, Server, Wifi, CheckCircle, Database, KeyRound } from "lucide-react";
import { motion, Variants } from "framer-motion";
import heroProtection from '../assets/images/redteaming.png';
import React from "react";
import { Shield, Lock, FileCheck, Activity } from "lucide-react";
import { ShieldCheck, Target, Search, } from "lucide-react";
import { Wrench, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import servicesImage from "@/assets/images/redteaming-asse.png";
import { MethodologyStep } from "./MethodologyStep";
import { useNavigate } from "react-router-dom";

const vulnerabilities = [
  {
    id: 1,
    title: "Authentication Weaknesses",
    description:
      "Weak or inconsistent login mechanisms can allow attackers to access sensitive systems. We reinforce authentication with strong policies and multi-factor verification.",
    alert: "Over 60% of breaches stem from compromised or weak authentication methods.",
    icon: Lock,
  },
  {
    id: 2,
    title: "Security Misconfigurations",
    description:
      "Improper settings or excessive permissions often expose internal systems to unnecessary risk. We audit configurations to align with proven security benchmarks.",
    alert: "Around 70% of organizations operate with misconfigured systems that increase exposure.",
    icon: ShieldCheck,
  },
  {
    id: 3,
    title: "Unpatched Systems",
    description:
      "Delaying critical updates leaves known vulnerabilities exploitable. We implement consistent patch management and continuous vulnerability monitoring.",
    alert: "Nearly 40% of cyber incidents are caused by unpatched or outdated software.",
    icon: Wrench,
  },
  {
    id: 4,
    title: "Privilege Mismanagement",
    description:
      "Excessive or poorly managed access rights expand the attack surface. We enforce least-privilege principles and ensure permissions match real operational needs.",
    alert: "Roughly half of all enterprise environments suffer from excessive or misused privileges.",
    icon: KeyRound,
  },
  {
    id: 5,
    title: "Insufficient Monitoring & Logging",
    description:
      "Without proper visibility, security incidents can remain hidden for weeks. We establish robust logging and monitoring systems to enable rapid detection and response.",
    alert: "Nearly 30% of breaches go unnoticed due to limited monitoring capabilities.",
    icon: Activity,
  },
  {
    id: 6,
    title: "Data Exposure Risks",
    description:
      "Misconfigured or unprotected storage can expose sensitive data publicly. We secure data repositories and enforce encryption to prevent accidental disclosure.",
    alert: "Roughly 25% of cloud storage systems are exposed due to misconfigurations.",
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
    icon: Lock,
    title: "Full-Scale Red Teaming",
    description:
      "Simulate sophisticated, multi-stage attacks to assess how your people, processes, and systems detect and respond under sustained pressure.",
    points: [
      "Multi-stage adversary simulation",
      "Extended engagement with realistic objectives",
      "Custom mission goals aligned to your risk profile",
    ],
  },
  {
    icon: Globe,
    title: "Targeted Red Teaming",
    description:
      "Focus on high-value assets—specific applications, systems, or workflows—to reveal deep technical and operational weaknesses.",
    points: [
      "Scope-focused testing on prioritized assets",
      "Fast, actionable findings with remediation guidance",
      "Evidence-backed, prioritized recommendations",
    ],
  },
  {
    icon: Wifi,
    title: "Physical Red Teaming",
    description:
      "Evaluate physical and human security by testing access controls, staff readiness, and resistance to social engineering techniques.",
    points: [
      "Physical access and perimeter testing",
      "Social engineering exercises (phishing, pretexting)",
      "Compliance checks and process validation",
    ],
  },
];


const processSteps = [
  {
    id: 1,
    title: "Reconnaissance",
    description:
      "Gather and analyze intelligence about your organization — including network topology, employee footprint, and defensive controls — to identify likely entry points.",
    icon: Search,
  },
  {
    id: 2,
    title: "Staging",
    description:
      "Prepare and conceal the infrastructure needed for controlled engagements, such as command-and-control (C2) servers and secure communication channels.",
    icon: Server,
  },
  {
    id: 3,
    title: "Attack Execution",
    description:
      "Execute multi-layered attack scenarios — from phishing and credential attacks to exploit-based intrusions — to validate detection and response capabilities.",
    icon: Target,
  },
  {
    id: 4,
    title: "Internal Compromise",
    description:
      "Emulate advanced adversary behavior by moving laterally, escalating privileges, and achieving mission objectives to measure organizational resilience.",
    icon: ShieldCheck,
  },
];

const redTeaming: React.FC = () => {
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
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          fontFamily: "'Whyte', sans-serif",
        }}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/60"></div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInLeft}
            className="space-y-4 flex flex-col items-center justify-center text-center"
          >
            {/* Header */}
            <h1
              className="font-normal leading-tight max-w-3xl text-white text-2xl sm:text-5xl md:text-[55px] md:leading-[1.1]"
              style={{ fontWeight: 400 }}
            >
              Red Teaming{" "}
              <span className="text-white">Assessment</span>
            </h1>

            {/* Paragraph */}
            <p
              className="max-w-xl mx-auto text-white/90 text-base sm:text-lg md:text-[24px] leading-relaxed"
              style={{ fontWeight: 300 }}
            >
              Simulate real-world attacks to test and improve your detection and response capabilities.
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
              {/* TOP SMALL HEADING */}
              <div
                className="text-l font-semibold text-transparent bg-clip-text 
                     bg-gradient-to-r from-[#4483f9] to-[#1a5de8] mb-4"
                style={{
                  fontFamily: "'Whyte', sans-serif",
                  fontWeight: 600,
                }}
              >
                RED TEAMING ASSESSMENT
              </div>

              {/* MAIN TITLE */}
              <h2
                className="mb-6 text-2xl sm:text-3xl md:text-4xl lg:text-[40px] 
                     text-[#0b0c1b] dark:text-white"
                style={{
                  fontFamily: "'Whyte', sans-serif",
                  fontWeight: 300,
                  lineHeight: "43px",
                }}
              >
                What is Red Teaming?
              </h2>

              {/* SUBTEXT */}
              <p
                className="mb-8 text-[#5a5c76] dark:text-gray-300"
                style={{
                  fontFamily: "'Whyte', sans-serif",
                  fontWeight: 400,
                  fontSize: "18px",
                }}
              >
                A controlled cyberattack simulation to assess your organization’s ability to detect and
                respond to advanced threats.
              </p>

              {/* SMALL BLUE SUBHEADING */}
              <div
                className="text-[#4483f9]"
                style={{
                  fontFamily: "'Whyte', sans-serif",
                  fontWeight: 600,
                }}
              >
                Comprehensive Threat Simulation
              </div>

              {/* PARAGRAPH */}
              <p
                className="mt-4 text-[#5a5c76] dark:text-gray-300"
                style={{
                  fontFamily: "'Whyte', sans-serif",
                  fontWeight: 400,
                  fontSize: "16px",
                }}
              >
                Red Teaming goes beyond traditional penetration testing by simulating real-world attacks
                over an extended period. It assesses your organization’s people, processes, and
                technology to uncover hidden weaknesses and strengthen overall resilience.
                <br /><br />
                Our experts mimic advanced adversaries using sophisticated tactics to reveal unseen
                threats and refine your defensive strategy.
              </p>

              {/* FEATURES GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">

                {/* Feature 1 */}
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="space-y-2"
                  style={{ fontFamily: "'Whyte', sans-serif" }}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-[#4483f9]" />
                    <h3 className="font-medium text-[#4483f9] text-[16px]">Proactive Defense</h3>
                  </div>
                  <p className="text-[#5a5c76] dark:text-gray-300 text-[15px]">
                    Uncover and resolve system flaws before they can be taken advantage of.
                  </p>
                </motion.div>

                {/* Feature 2 */}
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="space-y-2"
                  style={{ fontFamily: "'Whyte', sans-serif" }}
                >
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-[#4483f9]" />
                    <h3 className="font-medium text-[#4483f9] text-[16px]">Regulatory Alignment</h3>
                  </div>
                  <p className="text-[#5a5c76] dark:text-gray-300 text-[15px]">
                    Meet key compliance frameworks such as ISO 27001 and uphold best practices.
                  </p>
                </motion.div>

                {/* Feature 3 */}
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="space-y-2"
                  style={{ fontFamily: "'Whyte', sans-serif" }}
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-5 h-5 text-[#4483f9]" />
                    <h3 className="font-medium text-[#4483f9] text-[16px]">Data Safeguarding</h3>
                  </div>
                  <p className="text-[#5a5c76] dark:text-gray-300 text-[15px]">
                    Secure critical information assets and reinforce customer confidence.
                  </p>
                </motion.div>

                {/* Feature 4 */}
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="space-y-2"
                  style={{ fontFamily: "'Whyte', sans-serif" }}
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#4483f9]" />
                    <h3 className="font-medium text-[#4483f9] text-[16px]">Business Resilience</h3>
                  </div>
                  <p className="text-[#5a5c76] dark:text-gray-300 text-[15px]">
                    Limit disruptions and ensure continuous business functionality.
                  </p>
                </motion.div>

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
                alt="Network Security Dashboard"
                className="rounded-2xl w-full"
                style={{ boxShadow: "none", background: "transparent" }}
              />

              <div className="absolute bottom-6 left-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg px-4 py-2 flex items-center gap-2">
                <Shield className="text-blue-600 dark:text-blue-400 w-5 h-5" />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Enterprise-Grade Defense
                </span>
              </div>
            </motion.div>

          </div>
        </div>
      </section>


      <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-[2rem] text-white">
        {/* Header Section */}
        <div className="text-center mb-16 px-6">
          <p
            className="font-semibold uppercase tracking-wide"
            style={{
              fontFamily: "'Whyte', sans-serif",
              color: "#5ddcff",
              fontSize: "14px",
              letterSpacing: "2px",
            }}
          >
            Our Services
          </p>

          <h2
            className="text-3xl sm:text-3xl md:text-4xl lg:text-[50px] mt-2"
            style={{
              fontFamily: "'Whyte', sans-serif",
              fontWeight: 400,
              color: "#ffffff",
              lineHeight: "1.1",
            }}
          >
            Types of Red Teaming
          </h2>

          <p
            className="mt-4 max-w-3xl mx-auto text-lg leading-relaxed"
            style={{
              fontFamily: "'Whyte', sans-serif",
              fontWeight: 400,
              fontSize: "16px",
              color: "#b5c4e3",
            }}
          >
            Tailored, hands-on adversary simulations that uncover weaknesses across people, processes, and technology.
          </p>
        </div>

        {/* Cards Section */}
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testingTypes.map(({ icon: Icon, title, description, points }, index) => (
            <div
              key={index}
              className="bg-white/10 backdrop-blur-lg shadow-lg rounded-2xl p-8 border border-white/20 hover:shadow-2xl transition-all duration-300"
            >
              {/* Icon + Title Row */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center">
                  <Icon className="text-white w-6 h-6" />
                </div>
                <h3
                  style={{
                    fontFamily: "'Whyte', sans-serif",
                    fontWeight: 300,
                    color: "#ffffff",
                    fontSize: "17px",
                  }}
                >
                  {title}
                </h3>
              </div>

              <p
                style={{
                  fontFamily: "'Whyte', sans-serif",
                  fontWeight: 400,
                  fontStyle: "normal",
                  fontSize: "15px",
                  color: "#b5c4e3",
                }}
                className="mb-4"
              >
                {description}
              </p>

              <ul className="space-y-2 text-sm">
                {points.map((point, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle className="text-green-400 w-4 h-4" />
                    <span
                      style={{
                        fontFamily: "'Whyte', sans-serif",
                        fontWeight: 400,
                        fontSize: "14px",
                        color: "#9fd0ff",
                      }}
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
        {/* Background */}
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
          <p className="uppercase tracking-[0.3em] text-cyan-500 dark:text-cyan-400 text-sm font-semibold">
            Methodology
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] pb-0 mt-4 leading-tight bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-cyan-300 dark:to-blue-400 bg-clip-text text-transparent drop-shadow-[0_4px_10px_rgba(56,189,248,0.2)]">
            Our Red Teaming Methodology
          </h2>
          <p className="max-w-2xl mx-auto mt-6 text-gray-700 dark:text-gray-300 text-base leading-relaxed">
            A structured framework built to rigorously evaluate your defenses against real-world cyber threats.
          </p>
        </div>

        {/* Steps using Methodology component */}
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



      <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-[2rem] text-white">
        {/* Header Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center mb-16">
          <h4
            className="uppercase tracking-wide mb-2"
            style={{
              fontFamily: "'Whyte', sans-serif",
              fontWeight: 500,
              color: "#5ddcff",
              fontSize: "13px",
              letterSpacing: "2px",
            }}
          >
            Security Risks
          </h4>

          <h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] mt-2"
            style={{
              fontFamily: "'Whyte', sans-serif",

              fontWeight: 400,
              color: "#ffffff",
              lineHeight: "1.2",
            }}
          >
            Hidden Vulnerabilities That Threaten Your Organization
          </h2>

          <p
            className="mt-4 max-w-3xl mx-auto text-lg leading-relaxed"
            style={{
              fontFamily: "'Whyte', sans-serif",
              fontWeight: 400,
              fontSize: "16px",
              color: "#b5c4e3",
            }}
          >
            Identify overlooked vulnerabilities early to safeguard your infrastructure from costly breaches.
          </p>
        </div>

        {/* Cards Section */}
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {vulnerabilities.map((vuln) => {
            const Icon = vuln.icon;
            return (
              <Card
                key={vuln.id}
                className="bg-white/10 backdrop-blur-lg shadow-lg rounded-2xl p-8 border border-white/20 hover:shadow-2xl transition-all duration-300"
              >
                <div className="flex flex-col items-start text-left space-y-4">
                  {/* Icon + Title Row */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center">
                      <Icon className="text-white w-6 h-6" />
                    </div>
                    <h3
                      style={{
                        fontFamily: "'Whyte', sans-serif",
                        fontWeight: 300,
                        color: "#ffffff",
                        fontSize: "17px",
                      }}
                    >
                      {vuln.title}
                    </h3>
                  </div>

                  <p
                    style={{
                      fontFamily: "'Whyte', sans-serif",
                      fontWeight: 400,
                      fontStyle: "normal",
                      fontSize: "15px",
                      color: "#b5c4e3",
                    }}
                  >
                    {vuln.description}
                  </p>

                  <CardContent className="bg-white/10 text-red-300 text-sm rounded-xl mt-4 p-3 flex items-start space-x-2 border border-red-400/20">
                    <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-red-400" />
                    <span
                      style={{
                        fontFamily: "'Whyte', sans-serif",
                        fontWeight: 400,
                        fontSize: "14px",
                      }}
                    >
                      {vuln.alert}
                    </span>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      </section>



    </div>
  );
};

export default redTeaming;
