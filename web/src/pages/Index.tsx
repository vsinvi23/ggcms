import Navigation from "@/components/ui/navigation";
import HeroSection from "@/components/ui/hero-section";
import TrustStrip from "@/components/ui/trust-strip";
import Services from "@/components/ui/services";
import Testimonials from "@/components/ui/testimonials";
import Howweworks from "@/components/ui/howweworks";
import CTABanner from "@/components/ui/cta-banner";

const Index = () => {
  return (
    <div className="min-h-screen bg-background transition-all duration-500">
      <Navigation />
      <HeroSection />
      <TrustStrip />
      <Services />
      <Howweworks />
      <Testimonials />
      <CTABanner />
    </div>
  );
};

export default Index;