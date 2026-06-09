import React, { useEffect, useState } from "react";
import { motion, useScroll } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Shield, Target, Users, Zap } from "lucide-react";
import MissionImage from "@/assets/images/mission.jpg";

const useSyncedPhase = () => {
    const [phase, setPhase] = useState<"warning" | "loading" | "success">("warning");

    useEffect(() => {
        const phases: ("warning" | "loading" | "success")[] = ["warning", "loading", "success"];
        let current = 0;
        const interval = setInterval(() => {
            current = (current + 1) % phases.length;
            setPhase(phases[current]);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return phase;
};

const values = [
    {
        icon: <Shield className="w-10 h-10 text-blue-500" />,
        title: "Trust & Integrity",
        description:
            "We protect what matters most with honesty, reliability, and unwavering commitment to our clients’ digital safety.",
    },
    {
        icon: <Target className="w-10 h-10 text-blue-500" />,
        title: "Precision & Excellence",
        description:
            "Every solution we build at SerenyaX is engineered with accuracy, foresight, and an uncompromising standard of excellence.",
    },
    {
        icon: <Zap className="w-10 h-10 text-blue-500" />,
        title: "Innovation-Driven Security",
        description:
            "We continuously evolve — leveraging AI, automation, and cutting-edge research to stay ahead of modern cyber threats.",
    },
    {
        icon: <Users className="w-10 h-10 text-blue-500" />,
        title: "Collaboration & Empowerment",
        description:
            "Our success lies in teamwork — empowering businesses and people to build a secure and resilient digital ecosystem.",
    },
];

const About = () => {
    const phase = useSyncedPhase();
    const { scrollY } = useScroll();
    const navigate = useNavigate();

    const handleClick = () => {
        navigate("/contact-us");
    };

    return (
        <>
            {/* ======= About Us Section ======= */}
            <section className="relative bg-[#0b1120] text-center text-white py-28 overflow-hidden">
                {/* Background pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#1e293b_1px,transparent_0)] [background-size:20px_20px]" />

                {/* Content */}
                <div className="relative z-10 max-w-6xl mx-auto px-6">
                    {/* About Us Badge */}
                    <div className="flex justify-center mb-6">
                        <span className="bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-semibold px-5 py-1.5 rounded-full shadow-md">
                            About Us
                        </span>
                    </div>

                    {/* Heading */}
                    <div className="mx-auto max-w-6xl">
                        <h2
                            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#fff] dark:text-white transition-colors duration-500"
                            style={{ fontFamily: "Whyte, sans-serif", lineHeight: "1.1" }}
                        >
                            Securing the <span className="text-blue-400">Future of Digital Trust</span>
                        </h2>
                    </div>

                    {/* Description */}
                    <div className="mx-auto max-w-3xl">
                        <p className="text-gray-400 text-lg md:text-xl leading-relaxed">
                            Empowering organizations with advanced cybersecurity solutions — from
                            penetration testing and attack surface management to automated certificate
                            lifecycle governance — ensuring resilience, visibility, and confidence
                            across every layer of your digital ecosystem.
                        </p>
                    </div>
                </div>

                {/* Optional Bottom Wave Divider */}
                <div className="absolute bottom-0 left-0 right-0">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 1440 120"
                        className="w-full h-auto text-[#111827] fill-current"
                    >
                        <path d="M0,64L48,58.7C96,53,192,43,288,37.3C384,32,480,32,576,53.3C672,75,768,117,864,117.3C960,117,1056,75,1152,58.7C1248,43,1344,53,1392,58.7L1440,64L1440,0L0,0Z" />
                    </svg>
                </div>
            </section>

            {/* ======= Our Mission Section ======= */}
            <section className="relative bg-white dark:bg-[#0b1120] text-gray-800 dark:text-white py-24 px-6 lg:px-20 overflow-hidden">
                {/* Header - Centered */}
                <div className="text-center mb-16">
                    <span className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-4 py-1.5 text-sm font-semibold rounded-full shadow-sm">
                        Our Mission
                    </span>

                    <h2
                        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#0b0c1b] dark:text-white transition-colors duration-500"
                        style={{ fontFamily: "Whyte, sans-serif", lineHeight: "1.1" }}
                    >
                        Strengthening the Future of Cyber Resilience
                    </h2>

                </div>

                {/* Content Section */}
                <div className="flex flex-col lg:flex-row items-start justify-between gap-12">
                    {/* Left Side - Image */}
                    <div className="relative w-full lg:w-1/2 flex justify-center lg:justify-start">
                        <div className="relative shadow-xl rounded-2xl overflow-hidden">
                            <img
                                src={MissionImage}
                                alt="Cybersecurity Illustration"
                                className="rounded-2xl w-full max-w-xl object-cover"
                            />
                        </div>
                    </div>

                    {/* Right Side - Content */}
                    <div className="w-full lg:w-1/2 text-center lg:text-left">
                        <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300 mb-6">
                            At <strong>SerenyaX</strong>, we are redefining how organizations secure their digital ecosystems.
                            Our mission is to deliver next-generation security solutions that empower businesses to defend, detect,
                            and respond with confidence.
                        </p>

                        <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300 mb-6">
                            From <strong>Web, AI & LLM, and Network Pentesting</strong> to <strong>Application Security</strong> through Secure Code Review and Dynamic Application Testing —
                            we provide complete visibility into your security posture.
                            Our <strong>Network & Cloud Security</strong> services, including Cloud Configuration Review and Attack Surface Management,
                            ensure no risk goes unnoticed.
                        </p>

                        <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300 mb-8">
                            Our <strong>InfoSec & SOC</strong> expertise extends to Red Teaming and Digital Risk Assessment,
                            helping organizations build proactive, threat-aware defense mechanisms.
                            In addition, our flagship product — the <strong>Certificate Lifecycle Manager</strong> — streamlines digital certificate
                            management with automation, compliance, and complete visibility.
                        </p>

                        <button
                            onClick={handleClick}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg shadow-md transition-all"
                        >
                            Get in Touch
                        </button>
                    </div>
                </div>
            </section>


            <section className="relative bg-gradient-to-b from-[#f9fafb] to-[#eef2ff] dark:from-[#0b1120] dark:to-[#111827] py-24 px-6 text-center overflow-hidden">
                <div className="max-w-7xl mx-auto relative z-10">
                    {/* Tag */}
                    <div className="flex justify-center mb-4">
                        <span
                            style={{
                                fontFamily: "'Whyte', sans-serif",
                                fontWeight: 400,
                                fontSize: "14px",
                            }}
                            className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200 px-4 py-1.5 rounded-full"
                        >
                            Our Core Values
                        </span>
                    </div>

                    {/* Title */}
                    <h2
                        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-[#0b0c1b] dark:text-white transition-colors duration-500"
                        style={{ fontFamily: "Whyte, sans-serif", lineHeight: "1.1" }}
                    >
                        The Pillars of SerenyaX
                    </h2>

                    <p
                        style={{
                            fontFamily: "'Whyte', sans-serif",
                            fontWeight: 400,
                            fontStyle: "normal",
                            fontSize: "16px",
                        }}
                        className="max-w-3xl mx-auto mb-16 leading-relaxed text-[#5a5c76] dark:text-gray-300"
                    >
                        Our values define who we are — driving us to innovate, protect, and
                        empower organizations to thrive in a digital-first world. These principles
                        shape our approach to cybersecurity and long-term partnerships.
                    </p>

                    {/* Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {values.map((value, index) => (
                            <div
                                key={index}
                                className="group bg-white/80 dark:bg-[#1a2234]/80 backdrop-blur-lg border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-10 flex flex-col items-center text-center hover:shadow-xl hover:-translate-y-2 transition-all duration-500"
                            >
                                <div className="bg-blue-50 dark:bg-blue-500/20 rounded-full p-6 mb-6 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    {value.icon}
                                </div>

                                <h2
                                    style={{
                                        fontFamily: "'Whyte', sans-serif",
                                        fontWeight: 300,
                                        fontSize: "15px",
                                    }}
                                    className="text-[#0b0c1b] dark:text-white mb-3"
                                >
                                    {value.title}
                                </h2>

                                <p
                                    style={{
                                        fontFamily: "'Whyte', sans-serif",
                                        fontWeight: 400,
                                        fontStyle: "normal",
                                        fontSize: "15px",
                                    }}
                                    className="text-[#5a5c76] dark:text-gray-400 leading-relaxed"
                                >
                                    {value.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Decorative Glow */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.12),transparent_70%)] pointer-events-none" />
            </section>


        </>
    );

};

export default About;
