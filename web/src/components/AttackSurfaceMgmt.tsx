import { ArrowRight, Eye, Radar, Cpu, Network, MessageSquare } from "lucide-react";
import { motion, Variants } from "framer-motion";
import React from "react";
import { Shield } from "lucide-react";
import cyberImage from "../assets/images/ai.png";
import servicesImage from "@/assets/images/attacksrfacemanagement.jpg";
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
            "Reveal unmanaged and forgotten assets across your digital ecosystem. Gain complete visibility into cloud instances, domains, and endpoints before attackers can exploit them.",
    },
    {
        icon: <Shield className="h-6 w-6 text-indigo-600" />,
        title: "Minimize Attack Windows Early",
        description:
            "Identify misconfigurations and vulnerabilities before they become entry points. Guided remediation workflows enable faster, more effective response.",
    },
    {
        icon: <Radar className="h-6 w-6 text-indigo-600" />,
        title: "Comprehensive Security Visibility",
        description:
            "Monitor every layer — from on-prem to multi-cloud — through a unified platform. Track vulnerabilities across networks, APIs, and third-party systems with clarity and precision.",
    },
    {
        icon: <Cpu className="h-6 w-6 text-indigo-600" />,
        title: "Focus on What Truly Matters",
        description:
            "Leverage intelligent automation and dynamic risk scoring to eliminate noise and focus your team’s efforts on the highest-impact vulnerabilities.",
    },
    {
        icon: <Network className="h-6 w-6 text-indigo-600" />,
        title: "Advanced Attack Surface Intelligence",
        description:
            "Harness an AI-driven platform that learns from emerging attack patterns to deliver predictive insights, early warnings, and proactive defense strategies.",
    },
];

const AttackSurfaceMgmt: React.FC = () => {
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
                <div className="absolute inset-0 bg-black/60"></div>

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
                            Comprehensive Attack Surface Visibility
                        </h1>

                        {/* Paragraph */}
                        <p
                            className="max-w-4xl mx-auto text-white/90 text-[12px] sm:text-lg md:text-xl lg:text-2xl"
                            style={{
                                fontWeight: 300,
                                lineHeight: "1.5",
                            }}
                        >
                            Gain real-time visibility into your digital footprint with continuous asset discovery, vulnerability detection, and threat insights across cloud, APIs, and web applications.
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

            <section className="w-full bg-[#0B0C20] text-white py-12 sm:py-16 md:py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center gap-8 sm:gap-12">
                    {/* Left - Image */}
                    <div className="w-full md:w-1/2">
                        <img
                            src={cyberImage}
                            alt="Cyber threat visualization"
                            className="rounded-xl shadow-2xl w-full h-auto"
                        />
                    </div>

                    {/* Right - Content */}
                    <div className="w-full md:w-1/2">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-4 sm:mb-6">
                            Illuminate the Blind Spots in Your Digital Landscape
                        </h2>
                        <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-6 sm:mb-8">
                            Where visibility ends, attacks begin. We expose hidden risks across your digital footprint before adversaries can exploit them.
                        </p>
                        <button onClick={handleClick} className="bg-[#7B5CFA] hover:bg-[#694be0] transition-colors px-4 sm:px-6 py-2 sm:py-3 text-base sm:text-lg font-semibold rounded-lg shadow-md">
                            Explore Free Demo →
                        </button>
                    </div>
                </div>
            </section>

            <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-12 sm:py-16 md:py-20 text-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
                    <h2
                        className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] text-white mb-4"
                        style={{
                            fontFamily: "'Whyte', sans-serif",
                        }}
                    >
                        Manage Your Attack Surface <br /> Like a Hacker Would
                    </h2>
                    <p
                        className="max-w-3xl mx-auto mb-8 sm:mb-12 md:mb-16 text-sm sm:text-base md:text-lg"
                        style={{
                            fontFamily: "'Whyte', sans-serif",
                            fontWeight: 400,
                            color: "#b5c4e3",
                            lineHeight: "1.75",
                        }}
                    >
                        Continuously map your digital footprint to detect, prioritize, and respond to threats — before they turn into breaches.
                    </p>

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 justify-center">
                        {features.map((feature, index) => (
                            <div
                                key={index}
                                className="bg-white/10 backdrop-blur-lg shadow-lg rounded-2xl p-6 sm:p-8 text-left border border-white/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
                            >
                                {/* Icon and Title in One Line */}
                                <div className="flex items-center gap-3 sm:gap-4 mb-4">
                                    <div className="flex items-center justify-center w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400">
                                        {feature.icon}
                                    </div>
                                    <h3
                                        style={{
                                            fontFamily: "'Whyte', sans-serif",
                                            fontWeight: 500,
                                            color: "rgb(255, 255, 255)",
                                            fontSize: "16px",
                                            sm: { fontSize: "18px" },
                                        }}
                                    >
                                        {feature.title}
                                    </h3>
                                </div>

                                <p
                                    style={{
                                        fontFamily: "'Whyte', sans-serif",
                                        fontWeight: 400,
                                        fontStyle: "normal",
                                        fontSize: "14px",
                                        sm: { fontSize: "15px" },
                                        color: "#b5c4e3",
                                    }}
                                >
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="w-full bg-[#0B0C20] text-white py-12 sm:py-16 md:py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={fadeUp}
                        className="bg-[#14152E] border border-gray-700 rounded-2xl p-8 sm:p-12 shadow-md text-center"
                    >
                        {/* Icon */}
                        <div className="flex justify-center mb-4 sm:mb-6">
                            <div className="bg-indigo-600/20 p-3 sm:p-4 rounded-full">
                                <MessageSquare className="h-6 sm:h-8 w-6 sm:w-8 text-indigo-400" />
                            </div>
                        </div>

                        {/* Heading */}
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                            Ready to Secure Your Web Applications?
                        </h2>

                        {/* Subtext */}
                        <p className="text-gray-300 mb-8 sm:mb-10 text-base sm:text-lg max-w-2xl mx-auto">
                            Partner with us for a comprehensive security assessment and stay ahead of evolving cyber threats.
                        </p>

                        {/* CTA Button */}
                        <div className="flex justify-center">
                            <button onClick={handleClick}
                                className="relative flex items-center justify-center gap-3 rounded-full px-6 py-3 font-semibold text-white text-sm sm:text-base border border-white/50 bg-transparent overflow-hidden group transition-all"
                            >
                                {/* Hover fill animation */}
                                <span className="absolute inset-0 bg-[#4483f9] scale-x-0 group-hover:scale-x-100 origin-right transition-transform duration-300 ease-out"></span>

                                {/* Text */}
                                <span className="relative z-10">Get In Touch</span>

                                {/* Right circular icon */}
                                <div className="relative z-10 bg-[#4483f9] rounded-full p-1.5 transition-transform duration-300 group-hover:scale-110">
                                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                </div>
                            </button>
                        </div>
                    </motion.div>
                </div>
            </section>


        </div>
    );
};

export default AttackSurfaceMgmt;