import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { motion } from "framer-motion";

// Type added for industry field
const testimonials: { company: string; industry: string; rating: number; text: string }[] = [
  {
    company: "Infranit",
    industry: "Financial Services",
    rating: 5,
    text: "SerenyaX's solutions delivered a complete transformation. Operations were optimized and system reliability improved dramatically across all departments — our security posture has never been stronger.",
  },
  {
    company: "SteadyRabbit",
    industry: "Technology",
    rating: 5,
    text: "Our cloud migration and security upgrade were seamless with SerenyaX. Business continuity was maintained throughout, and overall system performance was significantly enhanced.",
  },
  {
    company: "Trono",
    industry: "Healthcare",
    rating: 5,
    text: "The team delivered unmatched technical expertise. Proactive monitoring caught issues before they escalated, and our downtime dropped to near zero within the first quarter.",
  },
];

const Testimonials = () => {
  return (
    <section
      className="py-14 lg:py-20 relative overflow-hidden transition-colors duration-500 bg-gray-50 dark:bg-[#0b0c1b]"
    >
      {/* Dark mode overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(128,128,255,0.06)_0%,_transparent_70%)] dark:bg-black/70 transition-colors duration-500" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex flex-col items-center text-center mb-8 lg:mb-10">
          <p className="text-xs font-bold tracking-[0.15em] uppercase text-[#4483f9] mb-3">
            Client Stories
          </p>
          <h2
            className="text-gray-900 dark:text-white text-center text-3xl sm:text-4xl md:text-5xl font-light leading-tight mb-4 transition-colors duration-500"
            style={{ fontFamily: "'Inter Tight', sans-serif", letterSpacing: "-0.01em" }}
          >
            Trusted by <span className="font-semibold text-[#4483f9]">industry leaders</span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-base max-w-lg text-center">
            Real outcomes from organizations that chose SerenyaX to protect their environments.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card
                className="group h-full bg-white dark:bg-gray-900/60 border-l-4 border-l-[#4483f9] border-t border-r border-b border-gray-100 dark:border-gray-800 hover:shadow-[0_8px_32px_rgba(68,131,249,0.12)] transition-all duration-300 hover:-translate-y-1 rounded-r-2xl rounded-l-sm"
              >
                <CardContent className="p-6 lg:p-8 flex flex-col h-full">
                  {/* Stars */}
                  <div className="flex items-center gap-0.5 mb-5">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-[#4483f9] fill-[#4483f9]" />
                    ))}
                  </div>

                  {/* Quote */}
                  <blockquote className="text-gray-700 dark:text-gray-200 leading-relaxed text-base lg:text-lg italic flex-grow mb-6 transition-colors duration-500">
                    "{testimonial.text}"
                  </blockquote>

                  {/* Attribution */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                    <div className="font-semibold text-gray-900 dark:text-white text-sm">
                      {testimonial.company}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {testimonial.industry}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
