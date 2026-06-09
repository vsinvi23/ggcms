import {
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import { motion, Variants } from "framer-motion";
import servicesImage from "@/assets/images/cyberthret.png";
import React from "react";
import { useNavigate } from "react-router-dom";

const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8 } },
};

const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8 } },
};



const CyberThreat: React.FC = () => {
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
        <div className="absolute inset-0 bg-black/80"></div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInLeft}
            className="space-y-2 flex flex-col items-center justify-center text-center"
          >
            {/* Header */}
            <h1
              className="font-normal leading-tight max-w-7xl text-white text-xl sm:text-5xl md:text-[66px] md:leading-[1.1]"
              style={{ fontWeight: 400 }}
            >
              Cyber Threat Intelligence {" "}
              <span className="text-white">at Your Fingertips</span>
            </h1>

            {/* Paragraph */}
            <p
              className="max-w-6xl mx-auto text-white/90 text-[12px] sm:text-lg md:text-[24px] leading-relaxed"
              style={{
                fontWeight: 300,
                lineHeight: "1.4"
              }}
            >
              Continuously track emerging vulnerabilities and active exploits, empowering faster, smarter responses across your apps, networks, and cloud infrastructure.
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


      {/* Security Team Section */}
      <section
        className="border rounded-xl py-16 
             bg-[rgb(205,192,177)] dark:bg-[#0f172a] 
             border-gray-200 dark:border-gray-700 transition-colors duration-300"
      >
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-10 md:gap-20">
          {/* Left Side - Heading */}
          <div>
            <p className="text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide">
              A Trusted Extension of Your Security Team
            </p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white mt-2 leading-tight">
              SerenyaX Offensive Experts Work Hand-in-Hand with Your In-House Defenders
            </h2>
          </div>

          {/* Right Side - Content */}
          <div className="space-y-6 text-gray-800 dark:text-gray-200">
            <div>
              <h3 className="font-semibold text-blue-700 dark:text-blue-400">Unified, Cost-Smart Model</h3>
              <p className="text-sm mt-1">
                We combine vulnerability assessment, continuous testing, and breach simulation in one streamlined framework — cutting costs while boosting visibility.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-blue-700 dark:text-blue-400">Expert Collaboration</h3>
              <p className="text-sm mt-1">
                Our red team specialists work alongside your defense teams, sharing insights and elevating your overall cyber maturity.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-blue-700 dark:text-blue-400">Clarity Over Chaos</h3>
              <p className="text-sm mt-1">
                We filter out noise, surfacing only verified, exploitable findings that truly matter to your organization.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-blue-700 dark:text-blue-400">Empowered Teams</h3>
              <p className="text-sm mt-1">
                Help your internal teams communicate risk clearly to leadership with evidence-based findings and actionable remediation insights.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-blue-700 dark:text-blue-400">Built for Compliance</h3>
              <p className="text-sm mt-1">
                Every engagement aligns with leading frameworks, turning compliance into measurable assurance.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-blue-700 dark:text-blue-400">Remediation Verified</h3>
              <p className="text-sm mt-1">
                We confirm resolved vulnerabilities and validate mitigations to ensure your defenses stay strong.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* Features */}

      {/* CTA */}
      {/* CTA Section */}
      <section className="w-full bg-[#0B0C20] text-center py-24 text-white">
        <div className="max-w-3xl mx-auto px-6">
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

          {/* Description */}
          <p className="text-gray-300 mb-10 text-lg">
            Our cybersecurity specialists are here to help you assess, secure,
            and evolve your organization’s attack surface — one layer at a time.
          </p>

          {/* Button */}
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
        </div>
      </section>

    </div>
  );
};

export default CyberThreat;
