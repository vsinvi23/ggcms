import { ArrowRight, } from "lucide-react";
import { motion, Variants } from "framer-motion";
import servicesImage from "@/assets/images/dynamic-application testing.jpg";
import React from "react";
import { ShieldCheck, Target, Search, Zap } from "lucide-react";
import { MethodologyStep } from "./MethodologyStep";
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


const processSteps = [
    {
        id: 1,
        title: "Unified Testing Platform",
        description:
            "Manage automated scans and expert-led penetration tests from a single platform — consolidating all results for a complete view of your security posture.",
        icon: ShieldCheck,
    },
    {
        id: 2,
        title: "Continuous Scanning",
        description:
            "Schedule recurring DAST scans across critical applications and APIs to detect vulnerabilities early and maintain ongoing protection throughout the SDLC.",
        icon: Search,
    },
    {
        id: 3,
        title: "Expert Analysis",
        description:
            "Augment automated findings with human expertise to uncover complex issues, validate risks, and eliminate false positives.",
        icon: Target,
    },
    {
        id: 4,
        title: "Streamlined Remediation",
        description:
            "Centralize and prioritize vulnerabilities in one place, accelerating remediation and minimizing development slowdowns.",
        icon: Zap,
    },
];


const DynamicAppSec: React.FC = () => {
    const navigate = useNavigate();
    const handleClick = () => {
        navigate("/contact-us");
    };
    return (
        <div className="min-h-screen bg-[#0e1220] text-slate-100">
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
                <div className="absolute inset-0 bg-black/80"></div>

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
                            className="font-normal leading-tight max-w-4xl text-white text-xl sm:text-5xl md:text-[42px] md:leading-[1.1]"
                            style={{ fontWeight: 400 }}
                        >
                            Continuous Security Testing for Stronger{" "}
                            <span className="text-white">Apps</span>
                        </h1>

                        {/* Paragraph */}
                        <p
                            className="max-w-3xl mx-auto text-white/90 text-[14px] sm:text-lg md:text-[20px] leading-relaxed"
                            style={{ fontWeight: 300 }}
                        >
                            Catch hidden flaws early with intelligent, continuous testing for your web apps and APIs.
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
                className="relative w-full px-6 sm:px-8 py-24 overflow-hidden transition-colors duration-500 
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
                    {/* Subtitle */}
                    <div
                        className="text-base sm:text-lg md:text-xl font-semibold text-transparent 
                 bg-clip-text bg-gradient-to-r from-[#4483f9] to-[#1a5de8] 
                 mb-4 uppercase tracking-widest"
                    >
                        DYNAMIC APPLICATION SECURITY TESTING (DAST)
                    </div>

                    {/* Title */}
                    <h2
                        className="mb-8 font-light text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-snug 
                 text-[#0b0c1b] dark:text-white"
                    >
                        Overview
                    </h2>

                    {/* Paragraph */}
                    <p
                        className="text-lg md:text-xl leading-relaxed max-w-5xl mx-auto 
                 text-gray-700 dark:text-gray-300"
                        style={{
                            fontWeight: 400,
                            fontStyle: "normal",
                            fontSize: "18px",
                        }}
                    >
                        Strengthen your application security posture with continuous, automated
                        scanning across your entire digital ecosystem. Our{" "}
                        <span className="font-semibold text-black dark:text-white">
                            Dynamic Application Security Testing (DAST)
                        </span>{" "}
                        solution detects vulnerabilities in web applications and APIs before they can
                        be exploited. Powered by intelligent automation and real-time monitoring, it
                        provides actionable insights to remediate issues quickly and reduce exposure —
                        ensuring every release is secure, stable, and production-ready.
                    </p>

                    {/* Decorative gradient divider */}
                    <div
                        className="mt-12 mx-auto w-24 h-1 
                 bg-gradient-to-r from-blue-400 to-cyan-400 
                 dark:from-blue-500 dark:to-cyan-500 
                 rounded-full animate-pulse"
                    ></div>
                </motion.div>
            </section>


            <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-20 text-white">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <h3 className="text-3xl md:text-4xl font-extrabold mb-12">
                        Challenges in Managing Web Application Security
                    </h3>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {/* Card 1 */}
                        <div className="bg-white/10 backdrop-blur-lg p-6 rounded-2xl border border-white/20 hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
                            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12h6m2 0a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v3a2 2 0 002 2zm2 0v7m0 0h3m-3 0H9"
                                    />
                                </svg>
                            </div>
                            <h4 className="text-lg font-semibold mb-2">Maintain Constant Visibility</h4>
                            <p className="text-gray-300 text-sm">
                                Continuously monitor your applications with automated DAST scans scheduled by the hour, day, or week.
                                Stay ahead of emerging vulnerabilities and address risks before they become serious threats.
                            </p>

                        </div>

                        {/* Card 2 */}
                        <div className="bg-white/10 backdrop-blur-lg p-6 rounded-2xl border border-white/20 hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
                            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-gradient-to-br from-green-400 to-emerald-600 rounded-lg">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                </svg>
                            </div>
                            <h4 className="text-lg font-semibold mb-2">Stay Informed and Responsive</h4>
                            <p className="text-gray-300 text-sm">
                                Correlate DAST results with other security insights and integrate them directly into your remediation workflows,
                                ensuring every threat is detected, prioritized, and resolved without delay.
                            </p>
                        </div>

                        {/* Card 3 */}
                        <div className="bg-white/10 backdrop-blur-lg p-6 rounded-2xl border border-white/20 hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
                            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 8c-1.657 0-3 1.343-3 3 0 1.166.621 2.182 1.553 2.707l-.895 3.577a1 1 0 001.281 1.182l3.382-.846a1 1 0 00.764-.953V11a3 3 0 00-3-3z"
                                    />
                                </svg>
                            </div>
                            <h4 className="text-lg font-semibold mb-2">Keep Development Moving</h4>
                            <p className="text-gray-300 text-sm">
                                Align scans with your release cycles by setting custom schedules, focus areas, and maintenance windows — ensuring security testing never slows innovation or performance.
                            </p>
                        </div>

                        {/* Card 4 */}
                        <div className="bg-white/10 backdrop-blur-lg p-6 rounded-2xl border border-white/20 hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
                            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            </div>
                            <h4 className="text-lg font-semibold mb-2">Reduce Operational Friction</h4>
                            <p className="text-gray-300 text-sm">
                                Automate security testing without disrupting development. Maintain delivery speed while strengthening your DevSecOps pipeline.
                            </p>

                        </div>
                    </div>
                </div>
            </section>


            <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-20 text-white">
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <p className="text-cyan-400 font-semibold uppercase tracking-wide">
                        Benefits
                    </p>
                    <h2 className="text-4xl md:text-5xl font-extrabold mt-2 mb-4">
                        Make Security a Continuous Practice
                    </h2>
                    <p className="text-gray-300 max-w-3xl mx-auto text-lg leading-relaxed mb-16">
                        Make security continuous. Automated DAST scans and expert insights keep your applications resilient by detecting issues before they’re exploited.
                    </p>

                    <div className="grid md:grid-cols-3 gap-10">
                        {/* Card 1 */}
                        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/20 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
                            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9 6 9-6-9-4-9 4zm0 10l9 4 9-4M3 7v10m18-10v10" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-3">Comprehensive Coverage</h3>
                            <p className="text-gray-300 text-sm leading-relaxed">
                                Continuously monitor all your web apps, domains, and APIs for vulnerabilities —
                                minimizing manual effort while maximizing visibility.
                            </p>
                        </div>

                        {/* Card 2 */}
                        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl p-8 rounded-2xl border border-white/20 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
                            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.105.895-2 2-2h4v10H6V9h4c1.105 0 2 .895 2 2z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-3">Seamless Integrations</h3>
                            <p className="text-gray-300 text-sm leading-relaxed">
                                Integrate effortlessly with your existing DevOps tools — from CI/CD pipelines to issue trackers —
                                keeping vulnerability insights where your developers work best.
                            </p>

                        </div>

                        {/* Card 3 */}
                        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/20 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
                            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m2 0a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v3a2 2 0 002 2zm2 0v7m0 0h3m-3 0H9" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-3">Layered Security Testing</h3>
                            <p className="text-gray-300 text-sm leading-relaxed">
                                Combine continuous automated scans with periodic deep-dive assessments to fortify your defenses.
                                This hybrid approach ensures both surface vulnerabilities and complex logic flaws are identified early.
                            </p>
                        </div>
                    </div>
                </div>
            </section>


            <section
                className="relative w-full py-28 px-6 overflow-hidden transition-colors duration-500 text-gray-900 dark:text-white"
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
                        Our Approach
                    </p>
                    <h2 className="text-4xl md:text-6xl pb-4 mt-4 leading-tight bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-cyan-300 dark:to-blue-400 bg-clip-text text-transparent drop-shadow-[0_4px_10px_rgba(56,189,248,0.2)]">
                        Continuous Application Security with DAST & PtaaS
                    </h2>
                    <p className="max-w-2xl mx-auto mt-6 text-gray-700 dark:text-gray-300 text-base leading-relaxed">
                        We blend automated scanning, expert manual testing, and a unified platform approach to deliver complete visibility into your application and API risks. Detect vulnerabilities early, minimize delays, and embed security seamlessly across your development lifecycle.
                    </p>
                </div>

                {/* Steps using Methodology component style */}
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

export default DynamicAppSec;
