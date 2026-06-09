import React from "react";
import { motion } from "framer-motion";

const stats = [
  { value: "300+", label: "Security Assessments", sub: "Delivered globally" },
  { value: "200+", label: "Enterprise Clients", sub: "Across industries" },
  { value: "11", label: "Monitoring Channels", sub: "DLP coverage" },
  { value: "50+", label: "Data Types Detected", sub: "With 93% accuracy" },
];

const StatsStrip = () => (
  <section className="relative z-10 bg-white dark:bg-[#0d1117] border-y border-gray-100 dark:border-white/10 transition-colors duration-500">
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100 dark:divide-white/10">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="flex flex-col items-center justify-center text-center px-6 py-10 gap-1 group"
          >
            <span className="text-4xl sm:text-5xl font-bold text-[#4483f9] tracking-tight leading-none">
              {stat.value}
            </span>
            <span className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mt-2">
              {stat.label}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{stat.sub}</span>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default StatsStrip;
