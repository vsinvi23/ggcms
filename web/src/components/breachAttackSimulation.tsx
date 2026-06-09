import { ArrowRight, Eye, Radar, Cpu, Network, MessageSquare, FileCheck, Activity, CheckCircle2, Lock, } from "lucide-react";
import { motion, Variants } from "framer-motion";
import React from "react";
import { Shield, } from "lucide-react";
import servicesImage from "@/assets/images/breachAttack.jpg";
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

const breachAttackSimulation: React.FC = () => {
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
                            className="font-normal leading-tight text-white whitespace-normal max-w-4xl text-xl sm:text-4xl md:text-5xl lg:text-[55px] md:whitespace-nowrap md:flex md:flex-col md:items-center"
                            style={{
                                fontWeight: 400,
                                lineHeight: "1.1",
                            }}
                        >
                            Stay One Step Ahead of Threats
                        </h1>

                        {/* Paragraph */}
                        <p
                            className="max-w-4xl mx-auto text-white/90 text-[10px] sm:text-[10px] md:text-xl lg:text-2xl"
                            style={{
                                fontWeight: 300,
                                lineHeight: "1.5",
                            }}
                        >
                            Proactively detect and counter real-world cyber threats with advanced attack simulations and expert assessment.
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
                className="
    relative 
    transition-colors duration-500
    bg-[#c9c8c9] dark:bg-[#0f172a]
  "
            >
                <div
                    className="pb-32 sm:pb-40 
               transition-colors duration-500
               bg-[rgb(205,192,177)] 
               dark:bg-[#111827]"
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
                                    style={{
                                        fontFamily: "'Whyte', sans-serif",
                                        fontWeight: 400,
                                    }}
                                    className="
              leading-snug text-2xl sm:text-5xl md:text-4xl lg:text-[55px] 
              text-[#0b0c1b] dark:text-white
            "
                                >
                                    Create an Unbreakable Security Strategy
                                </h2>
                            </motion.div>
                        </div>
                    </div>
                </div>

                {/* Overlapping Cards */}
                <div className="relative -mt-24 sm:-mt-32">
                    <div className="container mx-auto px-4 grid sm:grid-cols-2 md:grid-cols-3 gap-8">
                        {[
                            {
                                title: "Tailored Simulation Scenarios",
                                desc: "Recognizing that every organization operates differently, our security team crafts bespoke attack simulations that mirror your specific business environment, regulatory obligations, and operational workflows — ensuring relevant and practical insights.",
                                icon: FileCheck,
                            },
                            {
                                title: "Cutting-Edge Threat Intelligence",
                                desc: "Utilize insights derived from the latest threat research and adversary tactics developed by the Praetorian Labs team. By identifying potential exploitation patterns and attack vectors, your organization can anticipate and stay ahead of cyber threats effectively.",
                                icon: Activity,
                            },
                            {
                                title: "Insight-Driven Reporting",
                                desc: "Access comprehensive reports that combine executive overviews, detailed technical remediation steps, and business impact analysis. Each report is designed to clearly communicate actionable insights to all stakeholders, empowering informed decision-making.",
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
                                >
                                    <Card
                                        className="
                group relative overflow-hidden rounded-3xl 
                border border-white/30 dark:border-white/10
                shadow-lg hover:shadow-2xl 
                backdrop-blur-xl 
                bg-white/20 dark:bg-white/5 
                transition-all duration-500 h-full
              "
                                        style={{
                                            background:
                                                "linear-gradient(145deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 100%)",
                                        }}
                                    >
                                        {/* Hover Light Overlay */}
                                        <motion.div
                                            className="
                  absolute inset-0 
                  bg-gradient-to-b from-white/40 to-transparent 
                  dark:from-white/10 dark:to-transparent 
                  rounded-3xl pointer-events-none z-0
                "
                                            initial={{ opacity: 0 }}
                                            whileHover={{ opacity: 1 }}
                                            transition={{ duration: 0.4, ease: "easeInOut" }}
                                        />

                                        {/* Card Content */}
                                        <div className="relative z-10 flex flex-col h-full text-gray-900 dark:text-gray-200">
                                            {/* Top Bar */}
                                            <div className="
                    flex items-center gap-3 px-5 py-4 
                    border-b border-white/30 dark:border-white/10
                  ">
                                                <div
                                                    className="
                      p-3 rounded-xl 
                      bg-white/40 dark:bg-white/10 
                      backdrop-blur-md text-black dark:text-gray-200
                      transition-all duration-500 
                      group-hover:bg-white/60 dark:group-hover:bg-white/20 
                      shadow-sm group-hover:shadow-md
                    "
                                                >
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                <h3
                                                    className="text-lg font-semibold transition-colors"
                                                    style={{
                                                        fontFamily: "Whyte, sans-serif",
                                                        fontWeight: 400,
                                                        fontStyle: "normal",
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

                {/* White Section */}
                <div className="mt-12 sm:mt-16 py-16 sm:py-20 
                  transition-colors duration-500 
                  bg-white dark:bg-[#0f172a]"
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
                                    style={{
                                        fontFamily: "'Whyte', sans-serif",
                                        fontWeight: 400,
                                    }}
                                    className="
              leading-snug text-2xl sm:text-4xl md:text-4xl lg:text-[45px]
              text-[#0b0c1b] dark:text-white
            "
                                >
                                    Spot Vulnerabilities in Prevention and Detection Strategies
                                </h2>
                            </motion.div>
                        </div>
                    </div>

                    {/* Cards Section */}
                    <div className="container mx-auto px-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
                            {[
                                {
                                    title: "Strengthen Cyber Resilience",
                                    desc: "Stay ahead of sophisticated threats by understanding the latest tactics, techniques, and procedures (TTPs) used by adversaries. Gain actionable insights to prevent, detect, and respond effectively, while aligning with frameworks like NIST and CIS Controls.",
                                    icon: FileCheck,
                                },
                                {
                                    title: "Ongoing Security Optimization",
                                    desc: "Our Breach and Attack Simulation approach combines automated tools with expert-driven analysis. Continuous testing of security controls ensures iterative improvements and keeps your defenses adaptive to emerging threats.",
                                    icon: Activity,
                                },
                                {
                                    title: "Strategic Security Roadmap",
                                    desc: "Build a clear, actionable roadmap to elevate your security program, aligning improvement initiatives with organizational priorities and accelerating your overall security maturity.",
                                    icon: Lock,
                                },
                            ].map((card, idx, arr) => {
                                const Icon = card.icon;
                                const isLastOdd = arr.length % 2 !== 0 && idx === arr.length - 1;

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
                                        className={isLastOdd ? "md:col-span-2 lg:col-span-1 lg:justify-self-center" : ""}
                                    >
                                        <Card
                                            className="
                  group relative overflow-hidden rounded-3xl 
                  border border-white/30 dark:border-white/10
                  shadow-lg hover:shadow-2xl 
                  backdrop-blur-xl 
                  bg-white/20 dark:bg-white/5 
                  transition-all duration-500 h-full
                "
                                            style={{
                                                background:
                                                    "linear-gradient(145deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 100%)",
                                            }}
                                        >
                                            {/* Hover Light Overlay */}
                                            <motion.div
                                                className="
                    absolute inset-0 
                    bg-gradient-to-b from-white/40 to-transparent 
                    dark:from-white/10 dark:to-transparent 
                    rounded-3xl pointer-events-none z-0
                  "
                                                initial={{ opacity: 0 }}
                                                whileHover={{ opacity: 1 }}
                                                transition={{ duration: 0.4, ease: "easeInOut" }}
                                            />

                                            {/* Card Content */}
                                            <div className="relative z-10 flex flex-col h-full text-gray-900 dark:text-gray-200">
                                                {/* Top Bar */}
                                                <div
                                                    className="
                      flex items-center gap-3 px-5 py-4 
                      border-b border-white/30 dark:border-white/10
                    "
                                                >
                                                    <div
                                                        className="
                        p-3 rounded-xl 
                        bg-white/40 dark:bg-white/10 
                        backdrop-blur-md text-black dark:text-gray-200
                        transition-all duration-500 
                        group-hover:bg-white/60 dark:group-hover:bg-white/20 
                        shadow-sm group-hover:shadow-md
                      "
                                                    >
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                    <h3
                                                        className="text-lg font-semibold transition-colors"
                                                        style={{
                                                            fontFamily: "Whyte, sans-serif",
                                                            fontWeight: 400,
                                                            fontStyle: "normal",
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
                    </div>
                </motion.div>
            </section>



        </div>
    );
};

export default breachAttackSimulation;
