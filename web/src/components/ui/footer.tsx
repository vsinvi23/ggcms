import { Button } from "@/components/ui/button";
import { Mail, Twitter, Linkedin, Github, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom"; // ✅ Added for internal navigation

import logoTransparent from "@/assets/images/logolight-footer.png";
import internet from "@/assets/images/internet.png";
import AIicon from "@/assets/images/artificial-intelligence.png";
import networkIcon from "@/assets/images/teamwork.png";
import codeReviewIcon from "@/assets/images/code.png";
import ApplicationIcon from "@/assets/images/app-store.png";
import cloudIcon from "@/assets/images/cloud-computing.png";
import asmIcon from "@/assets/images/security-shield.png";
import redTeamIcon from "@/assets/images/hacker.png";
import solutionIcon from "@/assets/images/digital-certificate.png";

// ✅ Flattened list of services
const allServices = [
  { label: "Web Applications Pentest", icon: internet, to: "/application-security/pentest" },
  { label: "AI & ML Pentest", icon: AIicon, to: "/ai-ml-penetration-testing" },
  { label: "Network Pentest", icon: networkIcon, to: "/NetworkPentest/pentest" },
  { label: "Secure Code Review", icon: codeReviewIcon, to: "/secure-code-review" },
  { label: "Dynamic Application Security Testing", icon: ApplicationIcon, to: "/dast" },
  { label: "Cloud Configuration Review", icon: cloudIcon, to: "/cloud-security-review" },
  { label: "Attack Surface Management", icon: asmIcon, to: "/asm" },
  { label: "Red Teaming", icon: redTeamIcon, to: "/red-teaming" },
  { label: "Digital Risk Assessment", icon: internet, to: "/digital-risk-assessment" },
];

const solutionsDropdown = [
  { label: "Xyberguard-CLM", icon: solutionIcon, to: "/CertAxis" },
  { label: "Xyberguard-DLP", icon: asmIcon, to: "/xyberguard-dlp" },
];

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden bg-[#0a0a0a] text-white">
      {/* ✨ Grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)
          `,
          backgroundSize: "100px 60px",
          opacity: 0.25,
        }}
      ></div>

      {/* 🌐 Main container */}
      <div className="container mx-auto px-6 sm:px-8 lg:px-12 py-14 lg:py-20 relative z-10">
        <div className="grid gap-12 md:gap-10 lg:gap-16 md:grid-cols-2 lg:grid-cols-4">
          {/* 🧩 Company Info */}
          <div className="space-y-4 flex flex-col items-start">
            <img
              src={logoTransparent}
              alt="SerenyaX Logo"
              className="h-16 w-auto mb-2 transition-transform duration-500 hover:scale-105"
            />
            <p className="text-white/80 text-sm leading-relaxed max-w-xs mt-1">
              Transforming security through innovation.
              Your partner in digital trust and protection.
            </p>

            {/* Social icons */}
            <div className="flex space-x-3 mt-3">
              {[Twitter, Linkedin, Github].map((Icon, i) => (
                <Button
                  key={i}
                  size="icon"
                  variant="ghost"
                  className="text-white/70 hover:text-[#b0d0ff] hover:bg-white/10 transition-all duration-300"
                >
                  <Icon className="h-5 w-5" />
                </Button>
              ))}
            </div>
          </div>

          {/* 🛡 Services */}
          <div className="flex flex-col items-start">
            <h4 className="text-lg lg:text-xl font-semibold mb-5">Services</h4>
            <ul className="space-y-3 w-full">
              {allServices.map(({ label, to, icon }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className="flex items-center text-white/80 hover:text-[#b0d0ff] group transition-all duration-300"
                  >
                    <img
                      src={icon}
                      alt={label}
                      className="w-6 h-6 mr-3 object-contain opacity-80 group-hover:opacity-100 transition-all duration-300"
                    />
                    <span className="text-[15px] flex-1">{label}</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 🏢 Company + Solutions */}
          <div className="flex flex-col items-start space-y-8">
            {/* Company */}
            <div>
              <h4 className="text-lg lg:text-xl font-semibold mb-5">Company</h4>
              <ul className="space-y-3">
                {[
                  { label: "About Us", to: "/about" },
                  { label: "Contact", to: "/contact-us" },
                ].map(({ label, to }) => (
                  <li key={label}>
                    <Link
                      to={to}
                      className="flex items-center text-white/80 hover:text-[#b0d0ff] group transition-all duration-300"
                    >
                      <ArrowRight className="h-3 w-3 mr-2 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
                      <span className="text-[15px]">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Solutions */}
            <div>
              <h4 className="text-lg lg:text-xl font-semibold mb-5">Solutions</h4>
              <ul className="space-y-3">
                {solutionsDropdown.map(({ label, icon, to }) => (
                  <li key={label}>
                    <Link
                      to={to}
                      className="flex items-center text-white/80 hover:text-[#b0d0ff] group transition-all duration-300"
                    >
                      <img
                        src={icon}
                        alt={label}
                        className="w-6 h-6 mr-3 object-contain opacity-80 group-hover:opacity-100 transition-all duration-300"
                      />
                      <span className="text-[15px]">{label}</span>
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ✉️ Contact */}
          <div className="flex flex-col items-start">
            <h4 className="text-lg lg:text-xl font-semibold mb-5">Contact Us</h4>
            <div className="space-y-4">
              <div className="flex items-center space-x-3 group cursor-pointer">
                <Mail className="h-5 w-5 text-[#b0d0ff] group-hover:scale-110 transition-all duration-300" />
                <span className="text-white/80 text-[15px]">
                  info@serenyax.com
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <hr className="my-10 border-white/20" />

        {/* ⚙️ Bottom Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <p className="text-white/80 text-xs sm:text-sm md:text-base">
            © {currentYear} SerenyaX. All rights reserved.
          </p>

          <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2">
            <Link
              to="/privacy-policy"
              className="text-white/80 hover:text-[#b0d0ff] text-[15px] transition"
            >
              Privacy Policy
            </Link>
            <Link
              to="/terms-and-conditions"
              className="text-white/80 hover:text-[#b0d0ff] text-[15px] transition"
            >
              Terms and Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
