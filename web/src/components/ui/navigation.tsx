import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, ChevronDown, Sun, Moon } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";

import logoSolid from "@/assets/images/logo.png";
import logoTransparent from "@/assets/images/logolight.png";
import internet from "@/assets/images/internet.png";
import AIicon from "@/assets/images/artificial-intelligence.png";
import networkIcon from "@/assets/images/teamwork.png";
import codeReviewIcon from "@/assets/images/code.png";
import ApplicationIcon from "@/assets/images/app-store.png";
import cloudIcon from "@/assets/images/cloud-computing.png";
import asmIcon from "@/assets/images/security-shield.png";
import redTeamIcon from "@/assets/images/hacker.png";
import solutionIcon from "@/assets/images/digital-certificate.png";

const Navigation = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeTimeout = useRef<any>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);
  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  useEffect(() => {
    setIsMenuOpen(false);
    setOpenDropdown(null);
  }, [location.pathname]);


  const navItems = [
    { label: "Services", hasDropdown: true },
    { label: "Solutions", hasDropdown: true },
    { label: "About", to: "/about" },
    { label: "Contact", to: "/contact-us" },
  ];

  const servicesDropdown = {
    Pentest: [
      { label: "Web Applications Pentest", desc: "OWASP-aligned testing of web app attack surfaces", icon: internet, to: "/application-security/pentest" },
      { label: "AI & ML Pentest", desc: "Security review of AI models, pipelines and APIs", icon: AIicon, to: "/ai-ml-penetration-testing" },
      { label: "Network Pentest", desc: "Internal and external network security assessment", icon: networkIcon, to: "/NetworkPentest/pentest" },
    ],
    "App Security": [
      { label: "Secure Code Review", desc: "Manual and automated source code vulnerability analysis", icon: codeReviewIcon, to: "/secure-code-review" },
      { label: "Dynamic Application Security Testing", desc: "Runtime scanning of live applications for exploitable flaws", icon: ApplicationIcon, to: "/dast" },
    ],
    "Network & Cloud Security": [
      { label: "Cloud Configuration Review", desc: "Misconfiguration and compliance audits for cloud environments", icon: cloudIcon, to: "/cloud-security-review" },
      { label: "Attack Surface Management", desc: "Continuous discovery and monitoring of external-facing assets", icon: asmIcon, to: "/asm" },
    ],
    "InfoSec & SOC": [
      { label: "Red Teaming", desc: "Adversary simulation to test detection and response", icon: redTeamIcon, to: "/red-teaming" },
      { label: "Digital Risk Assessment", desc: "Identify and quantify business-critical digital risks", icon: internet, to: "/digital-risk-assessment" },
    ],
  };

  const solutionsDropdown = [
    { label: "Xyberguard-CLM", desc: "Automated PKI certificate lifecycle management at scale", icon: solutionIcon, to: "/CertAxis" },
    { label: "Xyberguard-DLP", desc: "Enterprise data loss prevention across 11 monitoring channels", icon: asmIcon, to: "/xyberguard-dlp" },
  ];

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(closeTimeout.current);
    };
  }, []);

  const baseFont = { fontFamily: "'Inter Tight', 'Inter', sans-serif" };
  const mainNavFont = { ...baseFont, fontWeight: 500, fontSize: "22.5px", letterSpacing: "0.01em" };
  const dropDownHFont = {
    ...baseFont,
    fontWeight: 700,
    fontSize: "11px",
    color: "#4483f9",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  };
  const dropdownFont = { ...baseFont, fontWeight: 400, fontSize: "13.5px" };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? "bg-white dark:bg-[#0f172a] shadow-md border-b border-gray-100 dark:border-white/10"
          : "bg-[#06091a]/80 backdrop-blur-md border-b border-white/[0.06]"
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex justify-between items-center h-40">
          {/* Logo */}
          <Link to="/">
            <img
              src={isScrolled ? logoSolid : logoTransparent}
              alt="SerenyaX logo"
              className="h-32 sm:h-36 w-auto transition-opacity duration-300 hover:opacity-90"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8 relative">
              {navItems.map((item) =>
                item.hasDropdown ? (
                  <div
                    key={item.label}
                    className="relative group"
                    onMouseEnter={() => {
                      clearTimeout(closeTimeout.current);
                      setOpenDropdown(item.label);
                    }}
                    onMouseLeave={() => {
                      closeTimeout.current = setTimeout(() => setOpenDropdown(null), 200);
                    }}
                  >
                    <button
                      style={mainNavFont}
                      className={`flex items-center gap-1 relative transition-all duration-300 ${
                        isScrolled
                          ? "text-gray-700 dark:text-white hover:text-[#4483f9] dark:hover:text-[#4483f9]"
                          : "text-white/90 hover:text-white"
                      }`}
                    >
                      {item.label}
                      <span className="text-[0.6rem] font-bold ml-0.5">▼</span>
                    </button>

                    {openDropdown === item.label && (
                      <div
                        className={`absolute z-50 mt-2 bg-white dark:bg-[#0f172a] shadow-2xl border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden
                          ${item.label === "Solutions" ? "left-0 w-[28rem]" : "left-1/2 -translate-x-1/2 w-[64rem]"}`}
                        style={{ borderTop: "3px solid #4483f9" }}
                      >
                        {item.label === "Services" ? (
                          /* ── Tenable-style Services mega-menu ── */
                          <div className="p-6">
                            <p style={dropDownHFont} className="mb-4 px-1">Our Services</p>
                            <div className="grid grid-cols-2 gap-1">
                              {Object.entries(servicesDropdown).flatMap(([section, items]) =>
                                items.map(({ label, desc, icon, to }) => (
                                  <Link
                                    key={label}
                                    to={to}
                                    onClick={() => setOpenDropdown(null)}
                                    className="group flex items-start gap-3 p-3 rounded-xl hover:bg-[#f0f4ff] dark:hover:bg-white/5 transition-colors duration-150"
                                  >
                                    <span className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-xl bg-[#f0f4ff] dark:bg-white/10 group-hover:bg-[#4483f9]/10 transition-colors">
                                      <img src={icon} alt="" className="h-5 w-5 object-contain" />
                                    </span>
                                    <span className="flex flex-col min-w-0">
                                      <span className="text-gray-900 dark:text-white text-[13px] font-semibold leading-snug truncate">{label}</span>
                                      <span className="text-gray-400 dark:text-gray-500 text-[11px] leading-snug mt-0.5 line-clamp-2">{desc}</span>
                                    </span>
                                  </Link>
                                ))
                              )}
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10 flex items-center justify-between px-1">
                              <span className="text-gray-400 dark:text-gray-500 text-[11px]">Not sure where to start?</span>
                              <Link
                                to="/contact-us"
                                onClick={() => setOpenDropdown(null)}
                                className="text-[#4483f9] text-[12px] font-semibold hover:underline"
                              >
                                Talk to an expert →
                              </Link>
                            </div>
                          </div>
                        ) : (
                          /* ── Tenable-style Solutions mega-menu ── */
                          <div className="p-5">
                            <p style={dropDownHFont} className="mb-4 px-1">Our Solutions</p>
                            <div className="flex flex-col gap-2">
                              {solutionsDropdown.map(({ label, desc, icon, to }) => (
                                <Link
                                  key={label}
                                  to={to}
                                  onClick={() => setOpenDropdown(null)}
                                  className="group flex items-start gap-4 p-3 rounded-xl hover:bg-[#f0f4ff] dark:hover:bg-white/5 transition-colors duration-150"
                                >
                                  <span className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-xl bg-[#f0f4ff] dark:bg-white/10 group-hover:bg-[#4483f9]/10 transition-colors">
                                    <img src={icon} alt="" className="h-6 w-6 object-contain" />
                                  </span>
                                  <span className="flex flex-col">
                                    <span className="text-gray-900 dark:text-white text-[13.5px] font-semibold leading-snug whitespace-nowrap">{label}</span>
                                    <span className="text-gray-400 dark:text-gray-500 text-[12px] leading-snug mt-1">{desc}</span>
                                  </span>
                                </Link>
                              ))}
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10 px-1">
                              <Link
                                to="/contact-us"
                                onClick={() => setOpenDropdown(null)}
                                className="text-[#4483f9] text-[12px] font-semibold hover:underline"
                              >
                                Request a demo →
                              </Link>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.label}
                    to={item.to}
                    style={mainNavFont}
                    className={`relative transition-all duration-300 ${
                      isScrolled
                        ? "text-[#4483f9] dark:text-[#4483f9] hover:text-[#5a94ff]"
                        : "text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              )}
            </div>
          </div>

          {/* Desktop CTA + Theme Toggle */}
          <div className="hidden md:flex items-center space-x-4">
            {mounted && (
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full bg-gray-200 dark:bg-gray-800 transition-all hover:scale-110"
                aria-label="Toggle Theme"
              >
                {theme === "light" ? (
                  <Moon className="text-gray-800" size={20} />
                ) : (
                  <Sun className="text-yellow-400" size={20} />
                )}
              </button>
            )}

            <Button
              size="sm"
              className={`text-white font-medium transition-all duration-300 rounded-full px-5 py-2.5 ${
                isScrolled
                  ? "bg-[#4483f9] hover:bg-[#5a94ff]"
                  : "bg-white/20 backdrop-blur-md"
              }`}
              style={mainNavFont}
              onClick={() => navigate("/contact-us")}
            >
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center gap-3">
            {mounted && (
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-full ${
                  isScrolled ? "bg-gray-200 dark:bg-gray-800" : "bg-white/20"
                } transition-all`}
              >
                {theme === "light" ? (
                  <Moon className={`${isScrolled ? "text-gray-800" : "text-white"}`} size={20} />
                ) : (
                  <Sun className="text-yellow-400" size={20} />
                )}
              </button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className={`${isScrolled ? "text-[#4483f9] dark:text-[#4483f9]" : "text-white"} p-2`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {!isMenuOpen ? <Menu className="h-6 w-6" /> : <X className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-[#f8f8f8] dark:bg-[#1e293b] text-black dark:text-white shadow-xl rounded-b-2xl border-t border-gray-200 dark:border-gray-700 max-h-[80vh] overflow-y-auto">
            <div className="px-5 pt-4 pb-6 space-y-4">
              {navItems.map((item) =>
                item.hasDropdown ? (
                  <div
                    key={item.label}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
                  >
                    <button
                      onClick={() =>
                        setOpenDropdown(openDropdown === item.label ? null : item.label)
                      }
                      style={mainNavFont}
                      className="flex w-full justify-between items-center py-3 px-4 text-[17px] font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                      {item.label}
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          openDropdown === item.label ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {openDropdown === item.label && (
                      <div className="px-4 pb-3 pt-2 space-y-3 border-t-4 border-t-[#4483f9] border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 rounded-b-lg">
                        {item.label === "Services"
                          ? Object.entries(servicesDropdown).map(([section, items]) => (
                              <div key={section}>
                                <h4 style={dropDownHFont} className="text-xs mb-1 mt-2 tracking-wide">
                                  {section}
                                </h4>
                                <ul className="space-y-2">
                                  {items.map(({ label, to }) => (
                                    <li key={label}>
                                      <Link
                                        to={to}
                                        onClick={() => {
                                          setIsMenuOpen(false);
                                          setOpenDropdown(null);
                                        }}
                                        style={dropdownFont}
                                        className="block text-sm hover:text-[#4483f9] transition-colors"
                                      >
                                        {label}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))
                          : solutionsDropdown.map(({ label, to }) => (
                              <Link
                                key={label}
                                to={to}
                                onClick={() => {
                                  setIsMenuOpen(false);
                                  setOpenDropdown(null);
                                }}
                                style={dropdownFont}
                                className="block text-sm py-1 hover:text-[#4483f9] transition-colors"
                              >
                                {label}
                              </Link>
                            ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => setIsMenuOpen(false)}
                    style={mainNavFont}
                    className="block w-full py-3 px-4 text-[17px] font-medium bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                  >
                    {item.label}
                  </Link>
                )
              )}

              <div className="pt-2">
                <Button
                  style={mainNavFont}
                  className="w-full bg-[#4483f9] hover:bg-[#5a94ff] text-white font-medium py-2.5 rounded-full shadow-md transition-all"
                  onClick={() => {
                    setIsMenuOpen(false);
                    navigate("/contact-us");
                  }}
                >
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
