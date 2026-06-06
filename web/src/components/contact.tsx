import React, { useState } from "react";
import emailjs from "@emailjs/browser";
import {
  Globe,
  Brain,
  Users,
  Layers,
  Smartphone,
  Cloud,
  Monitor,
  Zap,
  Database,
  Send,
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const servicesDropdown = {
  "Pentest Services": [
    { label: "Web Applications Pentest", icon: Globe },
    { label: "AI & ML Pentest", icon: Brain },
    { label: "Network Pentest", icon: Users },
  ],
  "Application Security": [
    { label: "Secure Code Review", icon: Layers },
    { label: "Dynamic Application Security Testing", icon: Smartphone },
  ],
  "Network & Cloud Security": [
    { label: "Cloud Configuration Review", icon: Cloud },
    { label: "Attack Surface Management", icon: Monitor },
  ],
  "InfoSec & SOC Services": [
    { label: "Red Teaming", icon: Zap },
    { label: "Digital Risk Assessment", icon: Database },
  ],
};

const ContactUs = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    interestedIn: "",
    message: "",
  });

  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
  
    if (!formData.name || !formData.email || !formData.message) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in all required fields before submitting.",
        variant: "destructive",
      });
      return;
    }
  
    setLoading(true);
  
    const currentTime = new Date().toLocaleString();
  
    // ✉️ Common template data
    const templateParams = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone || "Not provided",
      company: formData.company || "Not provided",
      interestedIn: formData.interestedIn || "Not specified",
      message: formData.message,
      time: currentTime,
    };
  
    // ⚙️ EmailJS Configuration
    const SERVICE_ID = "service_3z1y7ga";
    const ADMIN_TEMPLATE_ID = "template_dollpjd";
    const AUTO_REPLY_TEMPLATE_ID = "template_nuusr3b";
    const PUBLIC_KEY = "NTaOOaHVo_H0VOlox";
  
    try {
      // ✅ Step 1: Send notification to admin
      await emailjs.send(SERVICE_ID, ADMIN_TEMPLATE_ID, templateParams, PUBLIC_KEY);
  
      // ✅ Step 2: Send auto-reply to user
      await emailjs.send(
        SERVICE_ID,
        AUTO_REPLY_TEMPLATE_ID,
        {
          to_email: formData.email, // 👈 MUST MATCH your EmailJS “To email” variable
          name: formData.name,
          email: formData.email,
          phone: formData.phone || "Not provided",
          company: formData.company || "Not provided",
          interestedIn: formData.interestedIn || "Not specified",
          message: formData.message,
          time: currentTime,
        },
        PUBLIC_KEY
      );
  
      toast({
        title: "Message Sent Successfully!",
        description:
          "We’ve received your message and sent you an acknowledgment.",
      });
  
      // 🔄 Reset form
      setFormData({
        name: "",
        email: "",
        phone: "",
        company: "",
        interestedIn: "",
        message: "",
      });
    } catch (error) {
      console.error("EmailJS Error:", error);
      toast({
        title: "Failed to Send Message",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  
  

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0B0C20] via-[#11122C] to-[#1B1C35] px-4 sm:px-6 py-10 pt-[80px] overflow-x-hidden">
      <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-[#0B0C20] to-transparent pointer-events-none z-0" />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative max-w-4xl w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 mx-auto overflow-hidden z-10"
      >
        {/* Title */}
        <div className="text-center mb-8 md:mb-10">
          <motion.h1
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-wide"
          >
            Contact <span className="text-red-500">SerenyaX</span>
          </motion.h1>
          <p className="text-gray-300 mt-2 text-sm md:text-base">
            Fill in your details and our security experts will get in touch.
          </p>
        </div>

        {/* Form */}
        <motion.form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <input
            type="text"
            name="name"
            placeholder="Your Name *"
            value={formData.name}
            onChange={handleChange}
            required
            className="bg-white/20 text-white placeholder-gray-300 p-3 rounded-xl border border-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 w-full"
          />

          <input
            type="email"
            name="email"
            placeholder="Your Email *"
            value={formData.email}
            onChange={handleChange}
            required
            className="bg-white/20 text-white placeholder-gray-300 p-3 rounded-xl border border-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 w-full"
          />

          <input
            type="text"
            name="phone"
            placeholder="Phone Number"
            value={formData.phone}
            onChange={handleChange}
            className="bg-white/20 text-white placeholder-gray-300 p-3 rounded-xl border border-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 w-full"
          />

          <input
            type="text"
            name="company"
            placeholder="Company Name"
            value={formData.company}
            onChange={handleChange}
            className="bg-white/20 text-white placeholder-gray-300 p-3 rounded-xl border border-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 w-full"
          />

          <select
            name="interestedIn"
            value={formData.interestedIn}
            onChange={handleChange}
            className="bg-white/20 text-white placeholder-gray-300 p-3 rounded-xl border border-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 w-full md:col-span-2"
          >
            <option value="">Interested In</option>
            {Object.entries(servicesDropdown).map(([category, services]) => (
              <optgroup key={category} label={category}>
                {services.map((service) => (
                  <option
                    key={service.label}
                    value={service.label}
                    className="bg-gray-900 text-white"
                  >
                    {service.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <textarea
            name="message"
            placeholder="Your Message *"
            value={formData.message}
            onChange={handleChange}
            rows={4}
            required
            className="md:col-span-2 bg-white/20 text-white placeholder-gray-300 p-3 rounded-xl border border-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none w-full"
          ></textarea>

          <div className="md:col-span-2 flex justify-center mt-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className={`flex items-center justify-center gap-2 ${
                loading ? "bg-gray-400" : "bg-red-600 hover:bg-red-700"
              } text-white font-semibold py-3 px-8 rounded-xl shadow-lg transition-all duration-300`}
            >
              {loading ? "Sending..." : "Send Message"} <Send size={18} />
            </motion.button>
          </div>
        </motion.form>
      </motion.div>
    </section>
  );
};

export default ContactUs;
