import React from "react";
import {
    Search,
    GraduationCap,
    ShieldCheck,
    Rocket,
} from "lucide-react";


// 🖼️ Import local icons (SVGs or PNGs)
import huntIcon from "@/assets/images/arrow-right (1).png";
import educateIcon from "@/assets/images/arrow-right (2).png";
import reinforceIcon from "@/assets/images/arrow-right (3).png";
import optimizeIcon from "@/assets/images/arrow-right (4).png";

const frameworkSteps = [
    { label: "Hunt", color: "from-indigo-600 to-indigo-500", icon: huntIcon },
    { label: "Educate", color: "from-blue-600 to-blue-500", icon: educateIcon },
    { label: "Reinforce", color: "from-cyan-600 to-cyan-500", icon: reinforceIcon },
    { label: "Optimize", color: "from-emerald-600 to-emerald-500", icon: optimizeIcon },
];

const heroItems = [
    {
        title: "HUNT",
        subtitle: "See threats before they strike",
        desc: [
            "Smart human-risk scans",
            "AI-driven social engineering simulations",
            "Precision insight into where attackers target",
            "Human-behavior vulnerability mapping",
        ],
        result: "Eyes open to every hidden weakness.",
        icon: Search,
        gradient: "from-indigo-600 to-indigo-500",
    },
    {
        title: "EDUCATE",
        subtitle: "Turn knowledge into intuition",
        desc: [
            "Engaging micro-lessons in real workflow environments",
            "Instant feedback after risky behaviors",
            "Phishing, smishing & social manipulation mastery",
            "Motivational gamified learning experiences",
        ],
        result: "People who instinctively stop threats.",
        icon: GraduationCap,
        gradient: "from-blue-600 to-blue-500",
    },
    {
        title: "REINFORCE",
        subtitle: "Embed defense into daily habits",
        desc: [
            "Automated safety prompts and coaching",
            "Policy guardrails for secure decision-making",
            "Secure collaboration & messaging guidance",
            "Scalable behavioral reinforcement systems",
        ],
        result: "Human firewalls that block the breach.",
        icon: ShieldCheck,
        gradient: "from-cyan-600 to-cyan-500",
    },
    {
        title: "OPTIMIZE",
        subtitle: "Evolve from reactive to resilient",
        desc: [
            "Skills progression and workforce certification",
            "Leadership analytics & security dashboards",
            "Culture transformation pathways",
            "Continuous improvement for future threats",
        ],
        result: "An ever-advancing defense culture.",
        icon: Rocket,
        gradient: "from-emerald-600 to-emerald-500",
    },
];



export default function HEROModel() {
    return (
        <section className="relative overflow-hidden bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 py-[2rem]">
            {/* Background Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.15)_0%,transparent_60%)] pointer-events-none" />

            <div className="container relative mx-auto px-6 text-center">

                {/* 🔹 Added Top Center Label */}
                <div className="inline-block mb-3">
                    <span className="px-4 py-1 text-sm rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                        • How We Work
                    </span>
                </div>

                {/* Header */}
                <div className="mb-14">
                    <div className="relative inline-block text-center w-full px-4">
                        <div className="relative inline-block text-center w-full px-4">
                            <h2
                                className="text-xl sm:text-3xl md:text-5xl lg:text-4xl font-light text-white leading-tight tracking-tight transition-colors duration-500"
                                style={{ fontFamily: "'Inter Tight', 'Inter', sans-serif" }}
                            >
                                The{" "}
                                {/* Gradient letters for HERO */}
                                <span className="font-semibold bg-gradient-to-r from-indigo-600 to-indigo-500 text-transparent bg-clip-text">
                                    H
                                </span>
                                <span className="font-semibold bg-gradient-to-r from-blue-600 to-blue-500 text-transparent bg-clip-text">
                                    E
                                </span>
                                <span className="font-semibold bg-gradient-to-r from-cyan-600 to-cyan-500 text-transparent bg-clip-text">
                                    R
                                </span>
                                <span className="font-semibold bg-gradient-to-r from-emerald-600 to-emerald-500 text-transparent bg-clip-text">
                                    O
                                </span>{" "}
                                Model — Hunt, Educate, Reinforce, Optimize
                            </h2>

                            {/* Responsive gradient underline */}
                            <span
                                className="
      absolute left-1/2
      -bottom-3 sm:-bottom-4 md:-bottom-5
      w-2/3 sm:w-1/2 md:w-1/3
      h-[2px] sm:h-[3px]
      bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500
      transform -translate-x-1/2 rounded-full
    "
                            ></span>
                        </div>


                    </div>

                </div>

                <div className="flex flex-col items-center justify-center space-y-0 py-3">
                    {/* Top pill */}
                    <h3 className="text-center text-white text-sm tracking-wide inline-block px-4 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
                        H–E–R–O Framework
                    </h3>

                    {/* Visible vertical line */}
                    <div className="relative flex justify-center">
                        <div className="w-[2px] h-8 bg-gradient-to-b from-transparent via-white/40 to-transparent rounded-full"></div>
                    </div>
                </div>



                {/* Glass Container with Icons + Step Labels */}
                <div className="flex justify-center mb-20">
                    <div className="relative flex justify-between items-center w-full max-w-xl px-4 py-4 rounded-3xl border border-white/10 bg-[rgba(20,20,30,0.6)] backdrop-blur-2xl shadow-[0_8px_25px_rgba(0,0,0,0.4)]">
                        {/* Arrows/Icons in the center */}
                        <div className="flex justify-between items-center w-full relative">
                            {frameworkSteps.map((step, index) => (
                                <div key={index} className="flex flex-col items-center relative">
                                    {/* Centered Icon */}
                                    <div className="p-3 rounded-full max-[450px]:p-2 flex items-center justify-center">
                                        <img
                                            src={step.icon}
                                            alt={step.label}
                                            className="w-8 h-8 object-contain opacity-90 max-[450px]:w-5 max-[450px]:h-5"
                                        />
                                    </div>

                                    {/* Step Label below */}
                                    <div
                                        className={`absolute text-white text-xs sm:text-sm md:text-base px-5 py-0.5 rounded-xl shadow-md bg-gradient-to-r ${step.color}
                  max-[450px]:text-[9px] max-[450px]:px-0.5 max-[450px]:py-[2px]`}
                                        style={{
                                            bottom: "-1.8rem",
                                            fontFamily: "'Inter Tight', 'Inter', sans-serif",
                                            fontWeight: 300,
                                            minWidth: "60px",
                                            textAlign: "center",
                                        }}
                                    >
                                        {step.label}
                                    </div>

                                    {/* Connector line except last */}
                                    {index < frameworkSteps.length - 1 && (
                                        <div className="absolute top-1/2 right-[-10%] w-[22%] h-[1.5px] bg-gradient-to-r from-white/20 to-white/10 max-[450px]:right-[-8%] max-[450px]:w-[20%] max-[450px]:h-[1px]"></div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* HERO Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {heroItems.map((item, idx) => (
                        <div
                            key={idx}
                            className="relative group bg-gradient-to-b from-gray-800/60 to-gray-900/60 border border-gray-700/60 rounded-2xl p-6 flex flex-col justify-between text-white transition-all duration-300 hover:border-indigo-500/50 hover:shadow-[0_0_30px_-10px_rgba(99,102,241,0.5)] hover:scale-[1.02]"
                        >
                            {/* === Card Top Content === */}
                            <div className="flex flex-col flex-1">
                                {/* Icon + Title Row */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-3 bg-indigo-500/10 rounded-xl group-hover:bg-indigo-500/20 transition">
                                        <item.icon className="w-8 h-8 text-indigo-400 group-hover:text-cyan-400 transition ${item.gradient}" />
                                    </div>

                                    <h3
                                        className={`text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-r ${item.gradient}`}
                                    >
                                        {item.title}
                                    </h3>
                                </div>

                                {/* Subtitle */}
                                <p
                                    style={{
                                        fontFamily: "'Inter Tight', 'Inter', sans-serif",
                                        fontWeight: 400,
                                        fontSize: "15px",
                                        color: "#8da1e1",
                                    }}
                                    className="mb-3"
                                >
                                    {item.subtitle}
                                </p>

                                {/* Bullet Points */}
                                <ul className="space-y-2 mb-4">
                                    {item.desc.map((point, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-2 transition-all group-hover:translate-x-1 text-left"
                                        >
                                            {/* Custom bullet */}
                                            <span className="w-1.5 h-1.5 mt-[7px] flex-shrink-0 rounded-full bg-indigo-400 group-hover:bg-cyan-400 transition"></span>
                                            <p
                                                className="text-left"
                                                style={{
                                                    fontFamily: "'Inter Tight', 'Inter', sans-serif",
                                                    fontWeight: 400,
                                                    fontSize: "15px",
                                                    color: "#b3b6d1",
                                                    lineHeight: "1.6",
                                                    margin: 0,
                                                }}
                                            >
                                                {point}
                                            </p>
                                        </li>
                                    ))}
                                </ul>

                                {/* Result Text */}
                                <p
                                    style={{
                                        fontFamily: "'Inter Tight', 'Inter', sans-serif",
                                        fontWeight: 400,
                                        fontStyle: "italic",
                                        fontSize: "15px",
                                        color: "#e2e3ee",
                                    }}
                                    className="mt-auto"
                                >
                                    {item.result}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <p
                    style={{
                        fontFamily: "'Inter Tight', 'Inter', sans-serif",
                        fontWeight: 400,
                        color: "#b0b3c6",
                        fontSize: "17px",
                    }}
                    className="max-w-3xl mx-auto py-12"
                >
                    Serenyax believes every individual can become a{" "}
                    <span style={{ color: "white", fontWeight: 600 }}>Human HERO</span> against
                    cyber threats. Our framework strengthens instinct, boosts decision-making,
                    and builds a powerful, lasting culture of defense.
                </p>
            </div>
        </section>

    );
}