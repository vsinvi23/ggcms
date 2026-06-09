import React from "react";
import { Card } from "@/components/ui/card";
import {
  Cloud,
  Shield,
  Cog,
  Database,
  Monitor,
  Zap,
  ArrowRight,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const services = [
  {
    id: "asm",
    icon: Cloud,
    title: "Attack Surface Management",
    description:
      "Gain complete visibility and control over your dynamic threat landscape through continuous discovery, real-time monitoring, and proactive remediation of critical risks across your attack surface.",
    gradient: "bg-gradient-to-br from-[#eef2ff] via-[#e0e7ff] to-[#f5f3ff]",
    badge: null,
  },
  {
    id: "vulnerability-management",
    icon: Shield,
    title: "Vulnerability Management",
    description:
      "Continuously detect and prioritize vulnerabilities across your cloud, on-premises, and development environments to minimize exposure and reduce remediation time.",
    gradient: "bg-gradient-to-br from-[#f3f4f6] via-[#e5e7eb] to-[#f9fafb]",
    badge: null,
  },
  {
    id: "cyber-threat-intelligence",
    icon: Cog,
    title: "Cyber Threat Intelligence",
    description:
      "Strengthen decision-making with actionable intelligence that links vulnerabilities to real-world exploits and emerging adversary behaviors.",
    gradient: "bg-gradient-to-br from-[#ede9fe] via-[#e0f2fe] to-[#faf5ff]",
    badge: null,
  },
  {
    id: "attack-path-mapping",
    icon: Database,
    title: "Attack Path Mapping",
    description:
      "Visualize how attackers could chain vulnerabilities across systems to compromise key assets, enabling faster and more targeted defense strategies.",
    gradient: "bg-gradient-to-br from-[#f0fdf4] via-[#dcfce7] to-[#f9fafb]",
    badge: null,
  },
  {
    id: "continuous-penetration-testing",
    icon: Monitor,
    title: "Continuous Penetration Testing",
    description:
      "Regularly assess the effectiveness of your defenses through ongoing, real-world attack simulations that uncover gaps before adversaries do.",
    gradient: "bg-gradient-to-br from-[#eff6ff] via-[#dbeafe] to-[#faf5ff]",
    badge: null,
  },
  {
    id: "breach-attack-simulation",
    icon: Zap,
    title: "Breach & Attack Simulation",
    description:
      "Validate your detection and response capabilities with automated, controlled simulations that reveal weaknesses and enhance readiness.",
    gradient: "bg-gradient-to-br from-[#faf5ff] via-[#e0e7ff] to-[#eef2ff]",
    badge: null,
  },
  {
    id: "xyberguard-dlp",
    icon: ShieldAlert,
    title: "Xyberguard-DLP",
    description:
      "Enterprise-grade data loss prevention across 11 monitoring channels — USB, email, clipboard, cloud, network, OCR and more. Detects 50+ sensitive data types with 93% accuracy. Native India DPDP Act 2023 compliance.",
    gradient: "bg-gradient-to-br from-[#fff7ed] via-[#ffedd5] to-[#fef3c7]",
    badge: "Solution",
  },
  {
    id: "CertAxis",
    icon: Lock,
    title: "Xyberguard-CLM",
    description:
      "Centralized PKI certificate lifecycle management with automated renewal, multi-CA integration, and compliance reporting. Eliminate certificate-related outages and maintain continuous cryptographic trust.",
    gradient: "bg-gradient-to-br from-[#ecfdf5] via-[#d1fae5] to-[#f0fdf4]",
    badge: "Solution",
  },
];


const Services = () => {
  const navigate = useNavigate();

  const handleLearnMore = (id: string) => {
    navigate(`/${id}`);
  };

  return (
    <section
      id="services"
      className="py-[2rem] lg:py-32 relative overflow-hidden bg-[#f8f7f4] dark:bg-[#0b0c1b] transition-colors duration-700"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          className="flex flex-col items-center justify-center text-center gap-6 mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          viewport={{ once: true }}
        >
          <p className="text-xs font-bold tracking-[0.15em] uppercase text-[#4483f9] mb-3">
            Our Platform
          </p>
          <div className="relative inline-block">
            <h2
              className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#0b0c1b] dark:text-white tracking-tight transition-colors duration-500"
              style={{ fontFamily: "'Inter Tight', 'Inter', sans-serif", lineHeight: "1.08" }}
            >
              Advanced Cybersecurity Solutions
            </h2>
            <span className="absolute left-1/2 -bottom-6 w-3/6 h-[3px] bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 transform -translate-x-1/2 rounded-full"></span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-base mt-8 max-w-xl text-center">
            End-to-end visibility into your threat landscape — from discovery to remediation.
          </p>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <motion.div
                key={service.id}
                layout
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{
                  delay: index * 0.1,
                  duration: 0.6,
                  ease: [0.4, 0, 0.2, 1],
                }}
                viewport={{ once: true }}
                whileHover={{
                  scale: 1.04,
                  transition: { duration: 0.3, ease: "easeOut" },
                }}
              >
                <Card
                  className={`
                    group relative overflow-hidden rounded-3xl border backdrop-blur-xl transition-all duration-500 h-full
                    ${service.gradient} border-white/30
                    dark:bg-[rgba(255,255,255,0.05)] dark:border-[rgba(255,255,255,0.1)] dark:shadow-[0_4px_25px_rgba(0,0,0,0.3)]
                    dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:shadow-[0_6px_35px_rgba(0,0,0,0.5)]
                    dark:backdrop-blur-2xl dark:backdrop-saturate-150
                  `}
                >
                  {/* Remove light gradients in dark mode */}
                  <div className="absolute inset-0 dark:bg-[rgba(15,15,20,0.4)] dark:backdrop-blur-2xl rounded-3xl pointer-events-none"></div>

                  {/* Card Content */}
                  <div className="relative z-10 flex flex-col h-full text-gray-900 dark:text-white">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-white/40 dark:border-white/10">
                      <div className="p-3 rounded-xl bg-white/60 dark:bg-[rgba(255,255,255,0.12)] text-black dark:text-white transition-all duration-500 group-hover:bg-white/80 dark:group-hover:bg-[rgba(255,255,255,0.18)] shadow-sm group-hover:shadow-md flex-shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <h3
                          className="text-[15px] font-medium tracking-tight truncate"
                          style={{ fontFamily: "'Inter Tight', 'Inter', sans-serif" }}
                        >
                          {service.title}
                        </h3>
                        {service.badge && (
                          <span className="text-[10px] font-bold tracking-wider uppercase text-[#4483f9] mt-0.5">
                            {service.badge}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-5 py-5 flex flex-col justify-between flex-grow">
                      <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed mb-3">
                        {service.description}
                      </p>

                      <motion.button
                        onClick={() => handleLearnMore(service.id)}
                        className="text-gray-900 dark:text-white text-sm font-medium inline-flex items-center gap-1 hover:gap-2 transition-all"
                        whileHover={{ x: 3 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      >
                        View More
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </motion.button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Services;
