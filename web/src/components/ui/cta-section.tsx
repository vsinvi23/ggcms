import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const CTASection = () => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate("/contact-us");
  };

  return (
    <section
      className="py-20 lg:py-28 relative overflow-hidden text-center transition-all duration-500 bg-[rgb(205,192,177)] dark:bg-[#0f172a]"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-5xl mx-auto flex flex-col items-center justify-center">
          {/* Header */}
          <h2
            className="text-center drop-shadow-lg text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl px-4 transition-all duration-300 text-gray-900 dark:text-white"
            style={{
              fontFamily: "'Whyte', sans-serif",
              fontStyle: "normal",
              fontWeight: 400,
              lineHeight: "1.1",
              fontVariationSettings: '"INKT" 1',
              marginBottom: "24px",
            }}
          >
            Ready to transform your IT infrastructure?
          </h2>

          {/* Subtext */}
          <p
            className="mx-auto text-center text-base sm:text-lg md:text-xl lg:text-2xl px-4 transition-all duration-300 text-gray-800 dark:text-gray-300"
            style={{
              fontFamily: "'Whyte', sans-serif",
              fontStyle: "normal",
              fontWeight: 300,
              lineHeight: "1.4",
              marginBottom: "40px",
              maxWidth: "700px",
            }}
          >
            Join hundreds of companies who trust SerenyaX for their complete IT solutions. 
            Get started with a free consultation and discover how we can accelerate your business.
          </p>

          {/* Get In Touch Button */}
          <button
            onClick={handleClick}
            className="relative flex items-center justify-center gap-3 rounded-full px-6 py-3 font-semibold text-white text-sm sm:text-base border border-white/50 bg-transparent overflow-hidden group transition-all"
          >
            {/* Hover fill animation */}
            <span className="absolute inset-0 bg-[#5B17FF] scale-x-0 group-hover:scale-x-100 origin-right transition-transform duration-300 ease-out"></span>

            {/* Text */}
            <span className="relative z-10">Get In Touch</span>

            {/* Right circular icon */}
            <div className="relative z-10 bg-[#5B17FF] rounded-full p-1.5 transition-transform duration-300 group-hover:scale-110">
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
          </button>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
