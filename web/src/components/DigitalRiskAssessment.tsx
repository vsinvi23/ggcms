import { ArrowRight, Server, } from "lucide-react";
import { motion, Variants } from "framer-motion";
import React from "react";
import { ShieldCheck, Target, Search, Zap } from "lucide-react";
import servicesImage from "@/assets/images/digital-risk-assesment.jpg";
import { MethodologyStep } from "./MethodologyStep";
import { useNavigate } from "react-router-dom";


const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8 } }
};


const processSteps = [
  {
    id: 1,
    title: "Intelligent Threat Discovery",
    description:
      "We collect intelligence from open sources, dark web forums, and digital ecosystems to identify potential exposure points linked to your organization’s assets and reputation.",
    icon: Search,
  },
  {
    id: 2,
    title: "Deep Data Correlation",
    description:
      "Our experts correlate leaked data, compromised credentials, and indexed files to uncover sensitive or proprietary information that adversaries could exploit.",
    icon: Server,
  },
  {
    id: 3,
    title: "Comprehensive Source Mapping",
    description:
      "We consolidate insights from breach records, public disclosures, social media, and threat intelligence feeds to construct a holistic view of your digital risk landscape.",
    icon: Target,
  },
  {
    id: 4,
    title: "Actionable Risk Evaluation",
    description:
      "Each finding is analyzed through an adversary’s perspective to assess its true impact. You receive prioritized, actionable recommendations to mitigate risks effectively.",
    icon: ShieldCheck,
  },
];

const DigitalRiskAssessment: React.FC = () => {
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
        }}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/80"></div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-4 sm:px-3">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInLeft}
            className="space-y-3 flex flex-col items-center justify-center text-center"
          >
            {/* Header */}
            <h1 className="text-white font-light leading-tight max-w-6xl text-xl sm:text-4xl md:text-5xl lg:text-[55px]">
              Gain Complete Visibility  <span className="text-white"> into Your Digital Risks</span>
            </h1>

            {/* Paragraph */}
            <p className="max-w-2xl mx-auto text-white/90 text-[12px] sm:text-lg md:text-xl leading-relaxed">
              Examine your brand and digital assets through an external lens to uncover hidden vulnerabilities, assess emerging threats, and understand your true risk exposure — before attackers do.
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
        className="relative w-full px-6 sm:px-8 py-[3rem] overflow-hidden transition-colors duration-500 
             bg-gradient-to-br from-[#cdc0b1] via-[#e0d7c7] to-[#f5f2ed] 
             dark:bg-gradient-to-br dark:from-[#0f172a] dark:via-[#0a1220] dark:to-[#111827]"
      >
        {/* Decorative floating circles (light + dark) */}
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
          {/* Heading */}
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-[50px] font-bold mb-6 pb-4 
                   bg-gradient-to-r from-[#4483f9] to-[#1a5de8] 
                   bg-clip-text text-transparent">
            Digital Risk Insight
          </h2>

          {/* Paragraph */}
          <p className="text-base sm:text-lg md:text-xl leading-relaxed max-w-5xl mx-auto 
                  text-gray-700 dark:text-gray-300">
            Gain a comprehensive view of your organization’s external exposure through a proactive{" "}
            <span className="font-semibold text-black dark:text-white">
              Digital Risk Assessment
            </span>.
            Our experts analyze publicly available data, digital assets, and brand touchpoints to uncover threats that could
            compromise your reputation or operations.
            By identifying vulnerabilities before adversaries act, you can strengthen defenses and make data-driven
            decisions to reduce risk effectively.
          </p>

          {/* Decorative gradient divider */}
          <div className="mt-12 mx-auto w-24 h-1 
                    bg-gradient-to-r from-blue-400 to-cyan-400 
                    dark:from-blue-500 dark:to-cyan-500 
                    rounded-full animate-pulse"></div>
        </motion.div>
      </section>



      <section className="w-full bg-gradient-to-br from-[#0F1B4C] via-[#1B2A6B] to-[#0F1B4C] py-20 text-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-cyan-400 font-semibold uppercase tracking-wide">
            Benefits
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold mt-2 mb-4">
            Strengthen Security, Protect Your Brand
          </h2>
          <p className="text-gray-300 max-w-3xl mx-auto text-lg leading-relaxed mb-16">
            Gain complete visibility into your external risk landscape. Our{" "}
            <span className="font-semibold text-white">Digital Risk Assessment</span> blends expert intelligence with targeted testing
            to uncover hidden threats, protect your brand reputation, and deliver actionable insights for effective risk mitigation.
          </p>


          <div className="grid md:grid-cols-3 gap-10">
            {/* Card 1 */}
            <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/20 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9 6 9-6-9-4-9 4zm0 10l9 4 9-4M3 7v10m18-10v10" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Understand Your Exposure</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Discover what the world can see about your organization. Detect exposed assets, leaked credentials, and unsecured endpoints early—before they become opportunities for attackers.
              </p>

            </div>

            {/* Card 2 */}
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl p-8 rounded-2xl border border-white/20 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.105.895-2 2-2h4v10H6V9h4c1.105 0 2 .895 2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Safeguard Your Reputation</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Identify and neutralize threats to your brand—such as impersonation, fraudulent domains, and malicious content—before they damage trust or credibility.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/20 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-6 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m2 0a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v3a2 2 0 002 2zm2 0v7m0 0h3m-3 0H9" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Actionable Risk Mitigation</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Combine Digital Risk Assessments with targeted penetration testing to validate real vulnerabilities, gain complete visibility into your security posture, and implement precise, effective mitigation strategies.
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
            How We Uncover Digital Risk
          </h2>
          <p className="max-w-2xl mx-auto mt-6 text-gray-700 dark:text-gray-300 text-base leading-relaxed">
            Combining advanced intelligence with expert human analysis, we reveal how your organization appears to potential attackers. Our assessment maps digital exposure, identifies emerging threats, and helps you secure your online presence before it’s exploited.
          </p>

        </div>

        {/* Step Cards */}
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

export default DigitalRiskAssessment;
