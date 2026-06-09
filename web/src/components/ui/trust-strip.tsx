import React from "react";
import { motion } from "framer-motion";

const industries = [
  "BFSI",
  "Healthcare",
  "Government",
  "Manufacturing",
  "Technology",
  "Critical Infrastructure",
];

const TrustStrip = () => (
  <section className="bg-[#f8f7f4] dark:bg-[#0b0c1b] py-6 border-b border-gray-200 dark:border-white/10 transition-colors duration-500">
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="container mx-auto px-4 sm:px-6 lg:px-8"
    >
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        <span className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm font-medium tracking-widest uppercase whitespace-nowrap">
          Trusted in
        </span>
        <span className="text-gray-200 dark:text-white/10 select-none hidden sm:inline">|</span>
        {industries.map((industry, i) => (
          <React.Fragment key={industry}>
            <span className="text-gray-600 dark:text-gray-400 text-sm sm:text-[13px] font-medium px-3 py-1 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-[#4483f9]/50 hover:text-[#4483f9] dark:hover:text-[#4483f9] transition-colors duration-200">
              {industry}
            </span>
            {i < industries.length - 1 && (
              <span className="text-gray-200 dark:text-white/10 select-none hidden lg:inline">·</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </motion.div>
  </section>
);

export default TrustStrip;
