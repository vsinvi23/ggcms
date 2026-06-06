
const stats = [
  {
    number: "5,000+",
    label: "Security Checks",
    description: "Comprehensive assessments conducted across systems and networks",
  },
  {
    number: "250+",
    label: "Trusted Organizations",
    description: "Rely on our expertise for ongoing protection and compliance",
  },
  {
    number: "1,000+",
    label: "Website Protections",
    description: "Safeguarding digital assets from evolving online threats",
  },
  {
    number: "100%",
    label: "Make in India",
    description: "Proudly developed and operated entirely within India",
  },
];


const Stats = () => {
  return (
    <section className="py-16 lg:py-24 bg-primary text-primary-foreground relative overflow-hidden">
      {/* Animated background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-gradient-mesh animate-pulse-slow"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Heading */}
        <div className="text-center mb-12 lg:mb-16 transition-all duration-500">
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-primary-foreground">
            Numbers that speak for themselves
          </h2>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center group hover:scale-105 transition-all duration-500 cursor-default"
            >
              <div className="mb-3 transition-all duration-500">
                <span className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-primary-foreground group-hover:text-white transition-all duration-500">
                  {stat.number}
                </span>
              </div>
              <div className="text-lg md:text-xl lg:text-2xl font-semibold text-primary-foreground/90 mb-2 transition-all duration-500">
                {stat.label}
              </div>
              <div className="text-sm md:text-base text-primary-foreground/70 leading-relaxed max-w-xs mx-auto transition-all duration-500">
                {stat.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;

