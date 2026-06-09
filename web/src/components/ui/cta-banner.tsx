import React from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const CTABanner = () => {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0a0f2c] via-[#0d1b4b] to-[#0b0c1b] py-20 sm:py-28">
      {/* Subtle radial glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#4483f9]/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center"
      >
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-white/70 text-xs tracking-[0.12em] uppercase font-medium">
            Start Your Journey
          </span>
        </div>

        <h2
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-white mb-4 leading-tight"
          style={{ fontFamily: "'Inter Tight', 'Inter', sans-serif", letterSpacing: "-0.01em" }}
        >
          See your exposure{" "}
          <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-[#4483f9]">
            before attackers do
          </span>
        </h2>

        <p className="text-white/60 text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          Start with a comprehensive security assessment tailored to your environment.
          Identify, prioritize, and remediate — before threats become incidents.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/contact-us")}
            className="flex items-center gap-2 bg-[#4483f9] hover:bg-[#5a94ff] text-white font-semibold px-7 py-3 rounded-full transition-colors duration-200 text-sm sm:text-[15px]"
          >
            Request Assessment
            <ArrowRight className="w-4 h-4" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/contact-us")}
            className="flex items-center gap-2 border border-white/30 hover:border-white/60 text-white font-medium px-7 py-3 rounded-full transition-colors duration-200 text-sm sm:text-[15px] bg-white/5 hover:bg-white/10"
          >
            Contact Us
          </motion.button>
        </div>

        {/* Bottom trust line */}
        <p className="mt-8 text-white/30 text-xs tracking-wide">
          No commitment required · Free initial consultation · Tailored to your stack
        </p>
      </motion.div>
    </section>
  );
};

export default CTABanner;
