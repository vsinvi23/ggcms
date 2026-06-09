import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { ThemeProvider } from "next-themes"; // ✅ Add this

import Navigation from "@/components/ui/navigation";
import Footer from "@/components/ui/footer";
import About from "./components/ui/about";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import WebAppPentest from "@/components/webAppPentest";
import WiMlPentest from "@/components/aiMlPentest";
import NetworkPentestPage from "./components/NetworkPentest";
import RedTeaming from "./components/redTeaming";
import CodeReview from "./components/codeReview";
import DigitalRiskAssessment from "./components/DigitalRiskAssessment";
import CloudReview from "./components/cloud-review";
import DynamicAppSec from "./components/DynamicAppSec";
import AttackSurfaceMgmt from "./components/AttackSurfaceMgmt";
import VulnerabilityMgmt from "./components/VulnerabilityMgmt";
import CyberThreat from "./components/CyberThreat";
import AttackPatch from "./components/AttackPath";
import ContactUs from "./components/contact";
import PrivacyPolicy from "./components/ui/PrivacyPolicy";
import TermsConditions from "./components/ui/TermsConditions";
import BreachAttackSimulation from "./components/breachAttackSimulation";
import ContinuousPenetrationTesting from "./components/continuousPenetrationTesting";
import Howweworks from "@/components/ui/howweworks";
import CertAxis from "./components/CertAxis";
import XyberguardDLP from "./components/XyberguardDLP";
import PentestChaosSection from "./components/ui/PentestChaosSection";
import ScrollToTop from "./components/ScrollToTop";
const queryClient = new QueryClient();

const Layout = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background transition-all duration-500">
      <Navigation />
      <main className="flex-grow">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ThemeProvider attribute="class" defaultTheme="light">
        <BrowserRouter>
          {/* 👇 Add this here */}
          <ScrollToTop />
          
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/application-security/pentest" element={<WebAppPentest />} />
              <Route path="/ai-ml-penetration-testing" element={<WiMlPentest />} />
              <Route path="/NetworkPentest/pentest" element={<NetworkPentestPage />} />
              <Route path="/red-teaming" element={<RedTeaming />} />
              <Route path="/secure-code-review" element={<CodeReview />} />
              <Route path="/digital-risk-assessment" element={<DigitalRiskAssessment />} />
              <Route path="/cloud-security-review" element={<CloudReview />} />
              <Route path="/dast" element={<DynamicAppSec />} />
              <Route path="/asm" element={<AttackSurfaceMgmt />} />
              <Route path="/vulnerability-management" element={<VulnerabilityMgmt />} />
              <Route path="/cyber-threat-intelligence" element={<CyberThreat />} />
              <Route path="/attack-path-mapping" element={<AttackPatch />} />
              <Route path="/contact-us" element={<ContactUs />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/how-we-work" element={<Howweworks />} />
              <Route path="/terms-and-conditions" element={<TermsConditions />} />
              <Route path="/breach-attack-simulation" element={<BreachAttackSimulation />} />
              <Route path="/continuous-penetration-testing" element={<ContinuousPenetrationTesting />} />
              <Route path="/CertAxis" element={<CertAxis />} />
              <Route path="/xyberguard-dlp" element={<XyberguardDLP />} />
              <Route path="/about" element={<About />} />
              <Route path="/pentest-chaos-section" element={<PentestChaosSection />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
export default App;
