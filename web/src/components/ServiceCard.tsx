import { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

interface ServiceCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  features: string[];
}

export const ServiceCard = ({
  icon: Icon,
  title,
  description,
  features,
}: ServiceCardProps) => {
  return (
    <div
      className="
        relative
        rounded-2xl
        p-6
        border
        border-[#4483f9]/20
        bg-white/80
        
        shadow-[0_8px_32px_rgba(0,0,0,0.08)]
        hover:shadow-[0_8px_32px_rgba(68,131,249,0.25)]
        hover:border-[#4483f9]/40
        transition-all
        duration-300
        flex
        flex-col
        h-full
      "
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-white/30 rounded-2xl pointer-events-none" />

      {/* Content */}
      <div className="relative z-10">
        {/* Icon + Title */}
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-[#4483f9]/10 w-10 h-10 rounded-lg flex items-center justify-center backdrop-blur-sm">
            <Icon className="w-5 h-5 text-[#4483f9]" />
          </div>
          <h3
            style={{
              fontFamily: "'Whyte', sans-serif",
              fontWeight: 500,
              color: "rgb(11, 12, 27)",
              fontSize: "18px",
            }}
          >
            {title}
          </h3>
        </div>

        <p
          style={{
            fontFamily: "'Whyte', sans-serif",
            fontWeight: 400,
            fontStyle: "normal",
            fontSize: "15px",
            color: "#3a3b50",
          }}
          className="mb-6"
        >
          {description}
        </p>

        <ul className="space-y-2">
          {features.map((feature, index) => (
            <li
              key={index}
              className="flex items-center gap-2"
              style={{
                fontFamily: "'Whyte', sans-serif",
                fontWeight: 400,
                fontSize: "14px",
                color: "#3a3b50",
              }}
            >
              <Check className="w-4 h-4 text-[#4483f9] flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
