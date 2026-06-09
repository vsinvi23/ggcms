import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, Radar, Cpu, Network, MessageSquare, FileCheck, Activity, CheckCircle2, Lock, ShieldCheck, } from "lucide-react";

import { motion, Variants } from "framer-motion";
import aiThreatImage from "@/assets/images/handshake.png";
import React from "react";
import { Shield, } from "lucide-react";
import cyberImage from "../assets/images/ai.png";
import servicesImage from "@/assets/images/contiguious.jpg";
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




const features = [
    {
        icon: <Eye className="h-6 w-6 text-indigo-600" />,
        title: "Detect Hidden Assets and Shadow IT",
        description:
            "Reveal unmanaged and forgotten assets across your digital ecosystem. Gain visibility into cloud instances, domains, and endpoints before adversaries find them.",
    },
    {
        icon: <Shield className="h-6 w-6 text-indigo-600" />,
        title: "Minimize Attack Windows Early",
        description:
            "Identify misconfigurations and weaknesses before they become entry points. Our guided remediation workflows ensure threats are neutralized fast.",
    },
    {
        icon: <Radar className="h-6 w-6 text-indigo-600" />,
        title: "Comprehensive Security Visibility",
        description:
            "Monitor every layer — from on-prem to multi-cloud — with unified coverage. Track vulnerabilities across networks, APIs, and third-party integrations.",
    },
    {
        icon: <Cpu className="h-6 w-6 text-indigo-600" />,
        title: "Focus on What Truly Matters",
        description:
            "Leverage intelligent automation and risk prioritization so your security teams can focus on high-impact vulnerabilities, not noise.",
    },
    {
        icon: <Network className="h-6 w-6 text-indigo-600" />,
        title: "Advanced Attack Surface Intelligence",
        description:
            "Our AI-driven platform continuously learns from new attack patterns, helping you stay one step ahead with predictive insights and early warnings.",
    },
];

const continuousPenetrationTesting: React.FC = () => {
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
                {/* Optional dark overlay for contrast */}
                <div className="absolute inset-0 bg-black/80"></div>

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
                            className="font-normal leading-tight text-white whitespace-normal max-w-4xl text-2xl sm:text-4xl md:text-5xl lg:text-[55px] md:whitespace-nowrap md:flex md:flex-col md:items-center"
                            style={{
                                fontWeight: 400,
                                lineHeight: "1.1",
                            }}
                        >
                            Continuous Adversary Emulation
                        </h1>

                        {/* Paragraph */}
                        <p
                            className="max-w-4xl mx-auto text-white/90 text-base sm:text-lg md:text-xl lg:text-2xl"
                            style={{
                                fontWeight: 300,
                                lineHeight: "1.5",
                            }}
                        >
                            Proactively uncover vulnerabilities by replicating real-world cyber threats.
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
            <section className="relative w-full transition-colors duration-500 
    bg-[#c9c8c9] dark:bg-[#0f172a]">

                <div
                    className="pb-32 sm:pb-40 
      bg-gradient-to-b from-[#c9c8c9] via-[#e0dfdf] to-white 
      dark:bg-gradient-to-b dark:from-[#0f172a] dark:via-[#0b1120] dark:to-[#111827]"
                >
                    <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-12 items-center">

                            {/* Left - Image */}
                            <motion.div
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                variants={fadeInLeft}
                                className="flex justify-center"
                            >
                                <img
                                    src={aiThreatImage}
                                    alt="Persistent Penetration Operations"
                                    className="rounded-2xl shadow-card w-full max-w-sm sm:max-w-md object-cover"
                                />
                            </motion.div>

                            {/* Right - Text */}
                            <motion.div
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                variants={fadeInRight}
                            >
                                <h2
                                    className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 
              text-[#0b0c1b] dark:text-white"
                                    style={{
                                        fontFamily: "'Whyte', sans-serif",
                                        fontWeight: 400,
                                    }}
                                >
                                    Persistent Penetration Operations – Exposing Critical Risks
                                </h2>

                                <p
                                    className="text-base sm:text-lg mb-6 
              text-[#5a5c76] dark:text-gray-300"
                                    style={{
                                        fontFamily: "'Whyte', sans-serif",
                                        fontWeight: 400,
                                    }}
                                >
                                    Our ongoing red teaming exercises simulate real-world attacks to deliver actionable intelligence.
                                    These insights help your organization:
                                </p>

                                <ul
                                    className="space-y-4 
              text-[#5a5c76] dark:text-gray-300 
              text-sm sm:text-base"
                                    style={{
                                        fontFamily: "'Whyte', sans-serif",
                                        fontWeight: 400,
                                    }}
                                >
                                    {[
                                        "Focus security investments on the areas that matter most.",
                                        "Implement precise, high-impact security improvements.",
                                        "Effectively respond to the most critical risks facing your organization.",
                                    ].map((point, idx) => (
                                        <li key={idx} className="flex items-start gap-3">
                                            <CheckCircle2 className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                                            <span>{point}</span>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        </div>

                        {/* White Section */}
                        <div>
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
                                            className="leading-snug text-2xl sm:text-4xl md:text-4xl lg:text-[45px]
                  text-[#0b0c1b] dark:text-white"
                                            style={{
                                                fontFamily: "'Whyte', sans-serif",
                                                fontWeight: 400,
                                            }}
                                        >
                                            Monitor and Fortify Your Security Program Continuously
                                        </h2>
                                    </motion.div>
                                </div>
                            </div>

                            {/* Cards Section */}
                            <div className="container mx-auto px-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 justify-items-center">

                                    {[
                                        {
                                            title: "Tailored Attack Scenarios",
                                            desc: "Design attack simulations specifically around your organization's risk landscape and threat environment, ensuring exercises are meaningful and directly relevant to your security posture.",
                                            icon: FileCheck,
                                        },
                                        {
                                            title: "Insightful Analytics & Reporting",
                                            desc: "Receive comprehensive reports with actionable insights, empowering your team to make informed security decisions and strategically enhance your defenses.",
                                            icon: Activity,
                                        },
                                        {
                                            title: "Threat Intelligence Integration",
                                            desc: "Leverage up-to-date threat intelligence from Praetorian Labs to guide red team exercises, testing your defenses against both current and emerging adversarial tactics.",
                                            icon: Lock,
                                        },
                                        {
                                            title: "Collaborative Security Support",
                                            desc: "Partner with a dedicated team of security experts who work alongside your internal staff, promoting knowledge sharing, skill development, and a stronger security culture.",
                                            icon: ShieldCheck,
                                        },
                                    ].map((card, idx) => {
                                        const Icon = card.icon;
                                        return (
                                            <motion.div
                                                key={idx}
                                                initial={{ opacity: 0, y: 30 }}
                                                whileInView={{ opacity: 1, y: 0 }}
                                                transition={{
                                                    delay: idx * 0.1,
                                                    duration: 0.6,
                                                    ease: [0.4, 0, 0.2, 1],
                                                }}
                                                viewport={{ once: true }}
                                                whileHover={{
                                                    scale: 1.03,
                                                    transition: { duration: 0.3, ease: "easeOut" },
                                                }}
                                                className="w-full"
                                            >
                                                <Card
                                                    className="group relative overflow-hidden rounded-3xl 
                      border border-white/30 shadow-lg hover:shadow-2xl 
                      backdrop-blur-xl 
                      bg-white/20 dark:bg-white/10 
                      transition-all duration-500 h-full"
                                                    style={{
                                                        background:
                                                            "linear-gradient(145deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 100%)",
                                                    }}
                                                >
                                                    {/* Hover Light Overlay */}
                                                    <motion.div
                                                        className="absolute inset-0 
                        bg-gradient-to-b from-white/40 to-transparent 
                        dark:from-white/10 
                        rounded-3xl pointer-events-none z-0"
                                                        initial={{ opacity: 0 }}
                                                        whileHover={{ opacity: 1 }}
                                                        transition={{ duration: 0.4, ease: "easeInOut" }}
                                                    />

                                                    {/* Card Content */}
                                                    <div className="relative z-10 flex flex-col h-full 
                        text-gray-900 dark:text-gray-100">
                                                        <div className="flex items-center gap-3 px-5 py-4 
                          border-b border-white/30 dark:border-white/10">
                                                            <div
                                                                className="p-3 rounded-xl 
                            bg-white/40 dark:bg-white/20 
                            backdrop-blur-md text-black dark:text-white 
                            transition-all duration-500 
                            group-hover:bg-white/60 dark:group-hover:bg-white/30 
                            shadow-sm group-hover:shadow-md"
                                                            >
                                                                <Icon className="w-5 h-5" />
                                                            </div>

                                                            <h3
                                                                className="text-lg font-semibold transition-colors"
                                                                style={{
                                                                    fontFamily: "Whyte, sans-serif",
                                                                    fontWeight: 400,
                                                                    lineHeight: "normal",
                                                                    fontSize: "18px",
                                                                }}
                                                            >
                                                                {card.title}
                                                            </h3>
                                                        </div>

                                                        {/* Description */}
                                                        <div className="px-5 py-5 flex flex-col justify-between flex-grow">
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

                            {/* Bottom Section */}
                            <div className="py-16 sm:py-20">
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
                                                className="leading-snug text-2xl sm:text-4xl md:text-4xl lg:text-[45px]
                    text-[#0b0c1b] dark:text-white"
                                                style={{
                                                    fontFamily: "'Whyte', sans-serif",
                                                    fontWeight: 400,
                                                }}
                                            >
                                                Enhance Your Ability to Prevent, Detect, and Respond
                                            </h2>
                                        </motion.div>
                                    </div>
                                </div>

                                {/* Cards Section */}
                                <div className="container mx-auto px-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 justify-items-center">

                                        {[
                                            {
                                                title: "Strengthened Security Posture",
                                                desc: "Continuously testing and challenging your systems allows early detection and remediation of vulnerabilities, resulting in a more robust and resilient security environment.",
                                                icon: FileCheck,
                                            },
                                            {
                                                title: "Minimized Breach Exposure",
                                                desc: "Ongoing, rigorous simulations help reduce the chance of successful cyber-attacks, safeguarding your organization against potential financial and reputational losses.",
                                                icon: Activity,
                                            },
                                            {
                                                title: "Regulatory & Stakeholder Confidence",
                                                desc: "Showcase proactive cybersecurity measures to regulators, clients, and partners, demonstrating alignment with industry standards and compliance requirements.",
                                                icon: Lock,
                                            },
                                            {
                                                title: "Optimized Security Investments",
                                                desc: "Leverage insights from red team exercises to direct resources where they matter most, maximizing impact and strengthening your overall defense strategy.",
                                                icon: ShieldCheck,
                                            },
                                        ].map((card, idx) => {
                                            const Icon = card.icon;
                                            return (
                                                <motion.div
                                                    key={idx}
                                                    initial={{ opacity: 0, y: 30 }}
                                                    whileInView={{ opacity: 1, y: 0 }}
                                                    transition={{
                                                        delay: idx * 0.1,
                                                        duration: 0.6,
                                                        ease: [0.4, 0, 0.2, 1],
                                                    }}
                                                    viewport={{ once: true }}
                                                    whileHover={{
                                                        scale: 1.03,
                                                        transition: { duration: 0.3, ease: "easeOut" },
                                                    }}
                                                    className="w-full"
                                                >
                                                    <Card
                                                        className="group relative overflow-hidden rounded-3xl 
                        border border-white/30 shadow-lg hover:shadow-2xl 
                        backdrop-blur-xl 
                        bg-white/20 dark:bg-white/10 
                        transition-all duration-500 h-full"
                                                        style={{
                                                            background:
                                                                "linear-gradient(145deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 100%)",
                                                        }}
                                                    >
                                                        {/* Hover Light Overlay */}
                                                        <motion.div
                                                            className="absolute inset-0 
                          bg-gradient-to-b from-white/40 to-transparent 
                          dark:from-white/10 
                          rounded-3xl pointer-events-none z-0"
                                                            initial={{ opacity: 0 }}
                                                            whileHover={{ opacity: 1 }}
                                                            transition={{ duration: 0.4, ease: "easeInOut" }}
                                                        />

                                                        {/* Card Content */}
                                                        <div className="relative z-10 flex flex-col h-full 
                          text-gray-900 dark:text-gray-100">
                                                            <div className="flex items-center gap-3 px-5 py-4 
                            border-b border-white/30 dark:border-white/10">
                                                                <div
                                                                    className="p-3 rounded-xl 
                              bg-white/40 dark:bg-white/20 
                              backdrop-blur-md text-black dark:text-white 
                              transition-all duration-500 
                              group-hover:bg-white/60 dark:group-hover:bg-white/30
                              shadow-sm group-hover:shadow-md"
                                                                >
                                                                    <Icon className="w-5 h-5" />
                                                                </div>

                                                                <h3
                                                                    className="text-lg font-semibold transition-colors"
                                                                    style={{
                                                                        fontFamily: "Whyte, sans-serif",
                                                                        fontWeight: 400,
                                                                        lineHeight: "normal",
                                                                        fontSize: "18px",
                                                                    }}
                                                                >
                                                                    {card.title}
                                                                </h3>
                                                            </div>

                                                            {/* Description */}
                                                            <div className="px-5 py-5 flex flex-col justify-between flex-grow">
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
                            </div>
                        </div>
                    </div>
                </div>
            </section>



            <section className="container mx-auto px-4 py-20">
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeUp}
                    className="bg-[#0B0C20] border border-gray-700 rounded-2xl p-12 shadow-md text-center text-white"
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
                            className="relative flex items-center justify-center gap-3 rounded-full px-8 py-3 font-semibold text-white text-base border border-white/40 bg-transparent overflow-hidden group transition-all"
                        >
                            {/* Hover fill animation */}
                            <span className="absolute inset-0 bg-indigo-600 scale-x-0 group-hover:scale-x-100 origin-right transition-transform duration-300 ease-out"></span>

                            {/* Text */}
                            <span className="relative z-10">Get in Touch</span>

                            {/* Right circular icon */}
                            <div className="relative z-10 bg-indigo-600 rounded-full p-1.5 transition-transform duration-300 group-hover:scale-110">
                                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                            </div>
                        </button>
                    </div>
                </motion.div>
            </section>



        </div>
    );
};

export default continuousPenetrationTesting;
