import React, { useState } from "react";
import emailjs from "@emailjs/browser";
import { Mail, Clock, ShieldCheck, Send } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const trustPoints = [
  {
    icon: Clock,
    title: "24-hour response",
    desc: "Our security team reviews every enquiry within one business day.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise-grade expertise",
    desc: "Pentest, DLP, and compliance specialists on every engagement.",
  },
  {
    icon: Mail,
    title: "Confidential by default",
    desc: "Everything you share with us is handled under strict confidentiality.",
  },
];

const generateCaptcha = () => ({
  a: Math.floor(Math.random() * 10) + 1,
  b: Math.floor(Math.random() * 10) + 1,
});

const CONTACT_EMAIL = "info@serenyax.com";

const fieldClass =
  "mt-1.5 bg-white dark:bg-white/5 text-gray-900 dark:text-white border-gray-200 dark:border-white/10 focus-visible:ring-[#4483f9]";

const ContactUs = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    subject: "",
    message: "",
    website: "", // honeypot — real users never see or fill this
  });

  const [captcha, setCaptcha] = useState(generateCaptcha);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      company: "",
      subject: "",
      message: "",
      website: "",
    });
    setCaptchaAnswer("");
    setCaptcha(generateCaptcha());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Honeypot: real visitors never fill this field. Pretend success so bots
    // don't learn they were caught, but never call EmailJS for it.
    if (formData.website.trim() !== "") {
      toast({
        title: "Message Sent Successfully!",
        description: "We’ve received your message and sent you an acknowledgment.",
      });
      resetForm();
      return;
    }

    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in all required fields before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (Number(captchaAnswer) !== captcha.a + captcha.b) {
      toast({
        title: "Verification Failed",
        description: "Incorrect answer to the verification question. Please try again.",
        variant: "destructive",
      });
      setCaptchaAnswer("");
      setCaptcha(generateCaptcha());
      return;
    }

    setLoading(true);

    const currentTime = new Date().toLocaleString();

    const templateParams = {
      to_email: CONTACT_EMAIL,
      name: formData.name,
      email: formData.email,
      phone: formData.phone || "Not provided",
      company: formData.company || "Not provided",
      subject: formData.subject,
      message: formData.message,
      time: currentTime,
    };

    const SERVICE_ID = "service_3z1y7ga";
    const ADMIN_TEMPLATE_ID = "template_dollpjd";
    const AUTO_REPLY_TEMPLATE_ID = "template_nuusr3b";
    const PUBLIC_KEY = "NTaOOaHVo_H0VOlox";

    try {
      await emailjs.send(SERVICE_ID, ADMIN_TEMPLATE_ID, templateParams, PUBLIC_KEY);

      await emailjs.send(
        SERVICE_ID,
        AUTO_REPLY_TEMPLATE_ID,
        {
          to_email: formData.email,
          name: formData.name,
          email: formData.email,
          phone: formData.phone || "Not provided",
          company: formData.company || "Not provided",
          subject: formData.subject,
          message: formData.message,
          time: currentTime,
        },
        PUBLIC_KEY
      );

      toast({
        title: "Message Sent Successfully!",
        description: "We’ve received your message and sent you an acknowledgment.",
      });

      resetForm();
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
    <section className="relative min-h-screen bg-white dark:bg-[#0f172a] px-4 sm:px-6 lg:px-8 pt-32 pb-20">
      <div className="container mx-auto max-w-6xl grid lg:grid-cols-5 gap-12 lg:gap-16 items-start">
        {/* Left column — intro + trust points */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-2"
        >
          <p className="text-[#4483f9] font-semibold text-xs uppercase tracking-[0.08em] mb-3">
            Contact Us
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
            Let&apos;s talk security
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-[15px] leading-relaxed mb-10">
            Fill in your details and our security experts will get in touch to
            discuss how SerenyaX can help protect your business.
          </p>

          <div className="space-y-6">
            {trustPoints.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <span className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-xl bg-[#f0f4ff] dark:bg-white/10">
                  <Icon className="h-5 w-5 text-[#4483f9]" />
                </span>
                <div>
                  <p className="text-gray-900 dark:text-white font-semibold text-sm">{title}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 pt-6 border-t border-gray-100 dark:border-white/10">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-1.5">
              Prefer email? Reach our team directly at
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 text-[#4483f9] font-semibold text-sm hover:underline"
            >
              <Mail className="h-4 w-4" /> {CONTACT_EMAIL}
            </a>
          </div>
        </motion.div>

        {/* Right column — form */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="lg:col-span-3"
        >
          <Card className="border border-gray-100 dark:border-white/10 rounded-3xl shadow-xl p-6 sm:p-8 md:p-10 bg-white dark:bg-white/[0.03]">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Honeypot field — hidden from real users, tempting for bots */}
              <input
                type="text"
                name="website"
                value={formData.website}
                onChange={handleChange}
                tabIndex={-1}
                autoComplete="off"
                className="absolute -left-[9999px] w-px h-px opacity-0"
                aria-hidden="true"
              />

              <div>
                <Label htmlFor="name">Your Name *</Label>
                <Input
                  id="name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className={fieldClass}
                />
              </div>

              <div>
                <Label htmlFor="email">Your Email *</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className={fieldClass}
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </div>

              <div>
                <Label htmlFor="company">Company Name</Label>
                <Input
                  id="company"
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  type="text"
                  name="subject"
                  placeholder="e.g. Web app pentest enquiry"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="message">Your Message *</Label>
                <Textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={4}
                  required
                  className={`${fieldClass} resize-none`}
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="captchaAnswer">
                  Verification: What is {captcha.a} + {captcha.b}? *
                </Label>
                <Input
                  id="captchaAnswer"
                  type="number"
                  inputMode="numeric"
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  required
                  className={`${fieldClass} max-w-[140px]`}
                />
              </div>

              <div className="md:col-span-2 flex justify-center mt-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-[#4483f9] hover:bg-[#5a94ff] text-white font-semibold py-2.5 px-8 rounded-full shadow-md transition-all duration-300"
                >
                  {loading ? "Sending..." : "Send Message"} <Send size={18} />
                </Button>
              </div>
            </form>
          </Card>
        </motion.div>
      </div>
    </section>
  );
};

export default ContactUs;
