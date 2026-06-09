import { ArrowRight, Eye, Radar, Cpu, Network, MessageSquare, FileCheck, Activity, CheckCircle2, Lock, } from "lucide-react";
import { motion, Variants } from "framer-motion";
import React from "react";
import { Shield, } from "lucide-react";
import servicesImage from "@/assets/images/attack_surface.png";
import { Card } from "./ui/card";
import { useNavigate } from "react-router-dom";

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


const AttackPatch: React.FC = () => {
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
        {/* 🔹 Overlay for better text contrast */}
        <div className="absolute inset-0 bg-black/90 z-[1]" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInLeft}
            className="space-y-3 sm:space-y-3 flex flex-col items-center justify-center text-center"
          >
            {/* Header */}
            <h1
              className="font-normal leading-tight text-white whitespace-normal max-w-4xl text-xl sm:text-4xl md:text-5xl lg:text-[55px] md:whitespace-nowrap md:flex md:flex-col md:items-center"
              style={{
                fontWeight: 400,
                lineHeight: "1.1",
                textShadow: "0 2px 6px rgba(0,0,0,0.4)",
              }}
            >
              Attack Path Mapping for Complete Network Insight
            </h1>

            {/* Paragraph */}
            <p
              style={{
                fontWeight: 300,
                lineHeight: "1.5",
                textShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}
            >
              Map attacker paths, reveal hidden weaknesses, and get actionable insights to harden defenses and stop breaches before they happen.
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

      <section className="relative bg-[#c9c8c9] dark:bg-[#0f172a] transition-colors duration-500">
  {/* Top Background Strip */}
  <div
    className="pb-32 sm:pb-40 transition-colors duration-500 
               bg-[rgb(205,192,177)] dark:bg-[#111827]"
  >
    <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
      <div className="flex flex-col items-center justify-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInRight}
          className="max-w-7xl"
        >
          <h2
            style={{ fontFamily: "'Whyte', sans-serif", fontWeight: 400 }}
            className="mb-4 sm:mb-6 leading-snug text-2xl sm:text-5xl md:text-4xl lg:text-[55px]
                       text-[#0b0c1b] dark:text-white"
          >
            Uncover insights from your digital infrastructure
          </h2>

          <p
            style={{ fontFamily: "'Whyte', sans-serif", fontWeight: 400, fontSize: "30px" }}
            className="max-w-3xl mx-auto text-[#5a5c76] dark:text-gray-300"
          >
            Pinpoint vulnerabilities to focus your protection efforts and elevate your defense
            against emerging threats.
          </p>
        </motion.div>
      </div>
    </div>
  </div>

  {/* Card Section - Glassy Cards */}
  <div className="relative -mt-24 sm:-mt-32">
    <div className="container mx-auto px-4 grid sm:grid-cols-2 md:grid-cols-3 gap-8">
      {[
        {
          title: "Proactive Threat Discovery",
          desc: "SerenyaX conducts controlled simulations to assess how well your defenses withstand real-world attack sequences. Using advanced adversarial techniques, we uncover blind spots before they can be exploited.",
          icon: FileCheck,
        },
        {
          title: "Strategic Security Enhancement",
          desc: "Our experts map out vulnerabilities across your attack surface, enabling smarter allocation of security investments. Focus on mitigating the most significant risks that could impact your organization first.",
          icon: Activity,
        },
        {
          title: "Enhanced Incident Readiness",
          desc: "By analyzing potential breach pathways and testing response mechanisms, SerenyaX equips your teams to detect, contain, and neutralize threats faster — minimizing business disruption and impact.",
          icon: Lock,
        },
      ].map((card, idx) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={idx}
            layout
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.03 }}
          >
            <Card
              className="group relative overflow-hidden rounded-3xl 
                         border border-white/30 dark:border-white/10 
                         shadow-lg hover:shadow-2xl 
                         backdrop-blur-xl 
                         bg-white/20 dark:bg-white/5
                         transition-all duration-500 h-full"
              style={{
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 100%)",
              }}
            >
              {/* Hover overlay */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-b 
                           from-white/40 dark:from-white/10 
                           to-transparent rounded-3xl pointer-events-none z-0"
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
              />

              {/* Card Content */}
              <div className="relative z-10 flex flex-col h-full text-gray-900 dark:text-gray-100">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/30 dark:border-white/10">
                  <div
                    className="p-3 rounded-xl 
                               bg-white/40 dark:bg-white/10 
                               backdrop-blur-md text-black dark:text-white
                               transition-all group-hover:bg-white/60 dark:group-hover:bg-white/20"
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3
                    className="text-lg font-semibold"
                    style={{ fontFamily: "Whyte, sans-serif", fontWeight: 400 }}
                  >
                    {card.title}
                  </h3>
                </div>

                <div className="px-5 py-5 flex-grow">
                  <p className="text-gray-800 dark:text-gray-300 text-sm leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  </div>

  {/* White Section (Theme Adaptive) */}
  <div className="mt-12 sm:mt-16 py-16 sm:py-20 bg-white dark:bg-[#0f172a] transition-colors">
    <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-8">
      {[
        {
          title: "Realistic Adversary Emulation",
          desc: "SerenyaX’s offensive security specialists simulate advanced attacker behavior using real-world tactics and tools. These controlled exercises reveal how your environment would withstand targeted cyber campaigns.",
          icon: FileCheck,
        },
        {
          title: "Tailored Security Enhancement Plan",
          desc: "After each engagement, we deliver a customized roadmap highlighting discovered weaknesses, prioritized remediation steps, and strategic recommendations to elevate your overall security maturity.",
          icon: Activity,
        },
        {
          title: "Risk-Focused Security Insights",
          desc: "SerenyaX identifies the most impactful vulnerabilities across your environment, enabling you to prioritize remediation efforts and strengthen defenses against high-risk threats.",
          icon: FileCheck,
        },
        {
          title: "Optimized Security Investment",
          desc: "By pinpointing critical weaknesses, we help you allocate resources effectively, ensuring your security initiatives deliver maximum protection without overspending.",
          icon: Activity,
        },
        {
          title: "Resilient Security Architecture",
          desc: "Using attack path analysis, we provide actionable guidance to redesign or enhance your security infrastructure, making it more robust against evolving cyber threats.",
          icon: Lock,
        },
        {
          title: "Regulatory & Vendor Risk Assurance",
          desc: "Our approach gives a comprehensive view of potential attack vectors, helping organizations meet compliance standards and manage third-party risks that could affect sensitive data.",
          icon: Shield,
        },
      ].map((card, idx) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.03 }}
          >
            <Card
              className="group relative overflow-hidden rounded-3xl 
                         border border-white/30 dark:border-white/10 
                         shadow-lg hover:shadow-2xl 
                         backdrop-blur-xl 
                         bg-white/20 dark:bg-white/5
                         transition-all duration-500 h-full"
            >
              {/* Hover overlay */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-b 
                           from-white/40 dark:from-white/10 
                           to-transparent rounded-3xl pointer-events-none z-0"
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
              />

              {/* Card Content */}
              <div className="relative z-10 flex flex-col h-full text-gray-900 dark:text-gray-100">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/30 dark:border-white/10">
                  <div
                    className="p-3 rounded-xl 
                               bg-white/40 dark:bg-white/10 backdrop-blur-md 
                               text-black dark:text-white"
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3
                    className="text-lg font-semibold"
                    style={{ fontFamily: "Whyte, sans-serif", fontWeight: 400 }}
                  >
                    {card.title}
                  </h3>
                </div>

                <div className="px-5 py-5 flex-grow">
                  <p className="text-gray-800 dark:text-gray-300 text-sm leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  </div>
</section>

<section className="container mx-auto px-4 py-20">
  <motion.div
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true }}
    variants={fadeUp}
    className="bg-[#0B0C20] dark:bg-[#1a1f35] border border-gray-700 dark:border-gray-600 
               rounded-2xl p-12 shadow-md text-center text-white transition-colors duration-500"
  >
    {/* Icon */}
    <div className="flex justify-center mb-6">
      <div className="bg-indigo-600/20 p-4 rounded-full">
        <MessageSquare className="h-8 w-8 text-indigo-400" />
      </div>
    </div>

    {/* Heading */}
    <h2 className="text-3xl md:text-4xl font-bold mb-4">
      Ready to Strengthen Your Digital Defense Strategy?
    </h2>

    {/* Subtext */}
    <p className="text-gray-300 mb-10 text-lg max-w-2xl mx-auto">
      Our cybersecurity specialists are here to help you assess, secure, and evolve your
      organization’s attack surface — one layer at a time.
    </p>

    {/* CTA Button */}
    <div className="flex justify-center">
      <button
        onClick={handleClick}
        className="relative flex items-center justify-center gap-3 rounded-full px-8 py-3 
                   font-semibold text-white text-base border border-white/40 
                   bg-transparent overflow-hidden group transition-all"
      >
        <span className="absolute inset-0 bg-indigo-600 scale-x-0 
                         group-hover:scale-x-100 origin-right transition-transform duration-300"></span>

        <span className="relative z-10">Get in Touch</span>

        <div className="relative z-10 bg-indigo-600 rounded-full p-1.5 
                        transition-transform duration-300 group-hover:scale-110">
          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
      </button>
    </div>
  </motion.div>
</section>



    </div>
  );
};

export default AttackPatch;
