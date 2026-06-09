import React from "react";

interface MethodologyStepProps {
  number: number;
  title: string;
  description: string;
}

export const MethodologyStep = ({ number, title, description }: MethodologyStepProps) => {
  return (
    <div
      className="group relative w-full rounded-2xl p-8 pt-12 border border-black/5 dark:border-white/10 backdrop-blur-md transition-all duration-300
      bg-gradient-to-b from-white to-blue-50 dark:from-[#0f172a]/70 dark:to-[#0b132b]/80
      shadow-[0_0_15px_rgba(0,0,0,0.05)] dark:shadow-[0_0_25px_rgba(0,0,0,0.3)]
      hover:shadow-[0_0_30px_rgba(56,189,248,0.2)] dark:hover:shadow-[0_0_40px_rgba(56,189,248,0.3)]"
    >
      {/* 🔸 Step Badge */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 dark:from-blue-600 dark:to-cyan-400 text-white font-bold text-lg shadow-lg border border-white/20 dark:border-white/10">
        {number}
      </div>

      {/* 🔸 Step Content */}
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">
          {title}
        </h3>
        <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
          {description}
        </p>
      </div>

      {/* 🔸 Accent Line */}
      <div className="mt-6 h-[2px] w-16 mx-auto bg-gradient-to-r from-blue-400 to-cyan-500 dark:from-cyan-400 dark:to-blue-500 rounded-full opacity-60" />
    </div>
  );
};
