import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const PrivacyPolicy = () => {
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll("section[id]");
      let current = "";

      sections.forEach((section) => {
        const sectionTop = section.getBoundingClientRect().top;
        if (sectionTop <= 150) {
          current = section.getAttribute("id") || "";
        }
      });

      setActiveSection(current);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const tableOfContents = [
    { id: "definitions", title: "Definitions" },
    { id: "information-collection", title: "Information Collection and Use" },
    { id: "types-of-data", title: "Types of Data Collected" },
    { id: "use-of-data", title: "Use of Data" },
    { id: "gdpr", title: "Legal Basis for Processing (GDPR)" },
    { id: "retention", title: "Retention of Data" },
    { id: "transfer", title: "Transfer of Data" },
    { id: "disclosure", title: "Disclosure of Data" },
    { id: "protection", title: "How We Protect Your Data" },
    { id: "do-not-track", title: "Do Not Track Signals" },
    { id: "data-rights", title: "Your Data Protection Rights" },
    { id: "service-providers", title: "Service Providers" },
    { id: "links", title: "Links to Other Sites" },
    { id: "children", title: "Children's Privacy" },
    { id: "changes", title: "Changes to This Privacy Policy" },
    { id: "contact", title: "Contact Us" },
  ];

  return (
    <div className="min-h-screen white-background">
      {/* Hero Section */}
      <header className="bg-gradient-to-br from-primary/10 via-background to-background border-b border-border">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              Privacy Policy
            </h1>
            <p className="text-lg text-muted-foreground animate-in fade-in slide-in-from-bottom-5 duration-700">
              Effective date: January 1, 2025
            </p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
          {/* Table of Contents - Sidebar */}
          <aside className="lg:w-64 lg:sticky lg:top-8 lg:self-start">
            <Card className="p-6 bg-card border-border">
              <h2 className="text-lg font-semibold mb-4 text-foreground">Table of Contents</h2>
              <nav className="space-y-2">
                {tableOfContents.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className={`block w-full text-left text-sm py-2 px-3 rounded-md transition-colors ${
                      activeSection === item.id
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
              </nav>
            </Card>
          </aside>

          {/* Main Content */}
          <main className="flex-1 max-w-4xl">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              {/* Introduction */}
              <div className="mb-8">
                <p className="text-foreground leading-relaxed mb-4">
                  Serenyax ("us", "we", or "our") operates the https://www.serenyax.com website
                  (hereinafter referred to as the "Service").
                </p>
                <p className="text-foreground leading-relaxed mb-4">
                  This page informs you of our policies regarding the collection, use and disclosure of
                  personal data when you use our Service and the choices you have associated with that data.
                </p>
                <p className="text-foreground leading-relaxed">
                  We use your data to provide and improve the Service. By using the Service, you agree to the
                  collection and use of information in accordance with this policy. Unless otherwise defined in
                  this Privacy Policy, the terms used in this Privacy Policy have the same meanings as in our
                  Terms and Conditions.
                </p>
              </div>

              <Separator className="my-8" />

              {/* Definitions */}
              <section id="definitions" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Definitions</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Service</h3>
                    <p className="text-muted-foreground">
                      Service is the https://www.serenyax.com website operated by Serenyax.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Personal Data</h3>
                    <p className="text-muted-foreground">
                      Personal Data means data about a living individual who can be identified from those data
                      (or from those and other information either in our possession or likely to come into our
                      possession).
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Usage Data</h3>
                    <p className="text-muted-foreground">
                      Usage Data is data collected automatically either generated by the use of the Service or
                      from the Service infrastructure itself (for example, the duration of a page visit).
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Cookies</h3>
                    <p className="text-muted-foreground">
                      Cookies are small text files stored on your device (computer or mobile device).
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Data Controller</h3>
                    <p className="text-muted-foreground">
                      Data Controller means the natural or legal person who (either alone or jointly or in
                      common with other persons) determines the purposes for which and the manner in which any
                      personal information are, or are to be, processed. For the purpose of this Privacy Policy,
                      we are a Data Controller of your Personal Data.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">
                      Data Processors (or Service Providers)
                    </h3>
                    <p className="text-muted-foreground">
                      Data Processor (or Service Provider) means any natural or legal person who processes the
                      data on behalf of the Data Controller. We may use the services of various Service
                      Providers in order to process your data more effectively.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Data Subject (or User)</h3>
                    <p className="text-muted-foreground">
                      Data Subject is any living individual who is using our Service and is the subject of
                      Personal Data.
                    </p>
                  </div>
                </div>
              </section>

              {/* Information Collection */}
              <section id="information-collection" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Information Collection and Use</h2>
                <p className="text-foreground leading-relaxed">
                  We collect several different types of information for various purposes to provide and improve
                  our Service to you.
                </p>
              </section>

              {/* Types of Data */}
              <section id="types-of-data" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Types of Data Collected</h2>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">Personal Data</h3>
                    <p className="text-foreground mb-4">
                      While using our Service, we may ask you to provide us with certain personally identifiable
                      information that can be used to contact or identify you ("Personal Data"). Personally
                      identifiable information may include, but is not limited to:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-foreground ml-4">
                      <li>Email address</li>
                      <li>First name and last name</li>
                      <li>Phone number</li>
                      <li>Address, State, Province, ZIP/Postal code, City</li>
                      <li>Cookies, Tracking, and Usage Data</li>
                    </ul>
                    <p className="text-foreground mt-4">
                      We may use your Personal Data to contact you with newsletters, marketing or promotional
                      materials and other information that may be of interest to you. You may opt out of
                      receiving any, or all, of these communications from us by following the unsubscribe link
                      or instructions provided in any email we send or by contacting us.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">Usage Data</h3>
                    <p className="text-foreground">
                      We may also collect information on how the Service is accessed and used ("Usage Data").
                      This Usage Data may include information such as your computer's Internet Protocol address
                      (e.g. IP address), browser type, browser version, the pages of our Service that you visit,
                      the time and date of your visit, the time spent on those pages, unique device identifiers
                      and other diagnostic data.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">Cookies & Tracking Data</h3>
                    <p className="text-foreground mb-4">
                      We use cookies and similar tracking technologies to track the activity on our Service and
                      we hold certain information.
                    </p>
                    <p className="text-foreground mb-4">
                      Cookies are text files with a small amount of data which may include an anonymous unique
                      identifier. Cookies are sent to your browser from a website and stored on your device.
                      Other tracking technologies are also used such as beacons, tags and scripts to collect and
                      track information and to improve and analyze our Service.
                    </p>
                    <p className="text-foreground mb-4">
                      You can control cookies through your browser settings. You can instruct your browser to
                      refuse all cookies or to indicate when a cookie is being sent. However, if you do not
                      accept cookies, you may not be able to use some portions of our Service.
                    </p>
                    <p className="text-foreground font-semibold mb-2">Examples of Cookies we use:</p>
                    <ul className="list-disc list-inside space-y-2 text-foreground ml-4">
                      <li>Session Cookies: We use Session Cookies to operate our Service.</li>
                      <li>
                        Preference Cookies: We use Preference Cookies to remember your preferences and various
                        settings.
                      </li>
                      <li>Security Cookies: We use Security Cookies for security purposes.</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* Use of Data */}
              <section id="use-of-data" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Use of Data</h2>
                <p className="text-foreground mb-4">Serenyax uses the collected data for various purposes:</p>
                <ul className="list-disc list-inside space-y-2 text-foreground ml-4">
                  <li>To provide and maintain our Service</li>
                  <li>To notify you about changes to our Service</li>
                  <li>
                    To allow you to participate in interactive features of our Service when you choose to do so
                  </li>
                  <li>To provide customer support</li>
                  <li>To gather analysis or valuable information so that we can improve our Service</li>
                  <li>To monitor the usage of our Service</li>
                  <li>To detect, prevent and address technical issues</li>
                  <li>
                    To provide you with news, special offers and general information about other goods, services
                    and events we offer that are similar to those that you have already purchased or enquired
                    about, unless you have opted not to receive such information
                  </li>
                </ul>
              </section>

              {/* GDPR */}
              <section id="gdpr" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">
                  Legal Basis for Processing Personal Data under GDPR
                </h2>
                <p className="text-foreground mb-4">
                  If you are from the United Kingdom or the European Economic Area (EEA), Serenyax's legal
                  basis for collecting and using the personal information described in this Privacy Policy
                  depends on the Personal Data we collect and the specific context in which we collect it.
                </p>
                <p className="text-foreground mb-4">Serenyax may process your Personal Data because:</p>
                <ul className="list-disc list-inside space-y-2 text-foreground ml-4">
                  <li>We need to perform a contract with you</li>
                  <li>You have given us permission to do so</li>
                  <li>The processing is in our legitimate interests and it is not overridden by your rights</li>
                  <li>For payment processing purposes</li>
                  <li>To comply with law</li>
                </ul>
              </section>

              {/* Retention */}
              <section id="retention" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Retention of Data</h2>
                <p className="text-foreground mb-4">
                  Serenyax will retain your Personal Data only for as long as is necessary for the purposes set
                  out in this Privacy Policy. We will retain and use your Personal Data to the extent necessary
                  to comply with our legal obligations, resolve disputes, and enforce our legal agreements and
                  policies.
                </p>
                <p className="text-foreground">
                  Serenyax will also retain Usage Data for internal analysis purposes. Usage Data is generally
                  retained for a shorter period of time, except when this data is used to strengthen the
                  security or to improve the functionality of our Service, or we are legally obligated to retain
                  this data for longer periods.
                </p>
              </section>

              {/* Transfer */}
              <section id="transfer" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Transfer of Data</h2>
                <p className="text-foreground mb-4">
                  Your information, including Personal Data, may be transferred to — and maintained on —
                  computers located outside of your state, province, country or other governmental jurisdiction
                  where the data protection laws may differ from those of your jurisdiction.
                </p>
                <p className="text-foreground mb-4">
                  If you are located outside the United States and choose to provide information to us, please
                  note that we transfer the data, including Personal Data, to the United States and process it
                  there.
                </p>
                <p className="text-foreground">
                  Your consent to this Privacy Policy followed by your submission of such information represents
                  your agreement to that transfer. Serenyax will take all the steps reasonably necessary to
                  ensure that your data is treated securely and in accordance with this Privacy Policy.
                </p>
              </section>

              {/* Disclosure */}
              <section id="disclosure" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Disclosure of Data</h2>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">Business Transaction</h3>
                    <p className="text-foreground">
                      If Serenyax is involved in a merger, acquisition or asset sale, your Personal Data may be
                      transferred. We will provide notice before your Personal Data is transferred and becomes
                      subject to a different Privacy Policy.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">
                      Disclosure for Law Enforcement
                    </h3>
                    <p className="text-foreground">
                      Under certain circumstances, Serenyax may be required to disclose your Personal Data if
                      required to do so by law or in response to valid requests by public authorities (e.g. a
                      court or a government agency).
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">Legal Requirements</h3>
                    <p className="text-foreground mb-4">
                      Serenyax may disclose your Personal Data in the good faith belief that such action is
                      necessary to:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-foreground ml-4">
                      <li>To comply with a legal obligation</li>
                      <li>To protect and defend the rights or property of Serenyax</li>
                      <li>To prevent or investigate possible wrongdoing in connection with the Service</li>
                      <li>To protect the personal safety of users of the Service or the public</li>
                      <li>To protect against legal liability</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* Protection */}
              <section id="protection" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">How We Protect Your Data</h2>
                <p className="text-foreground mb-4">
                  We have adopted data collection, storage, and processing practices and technical and
                  organizational security measures to protect against unauthorized access, alteration, and
                  disclosure of Personal Data.
                </p>
                <p className="text-foreground">
                  Please note that the security of your data is important to us, but no method of transmission
                  over the Internet or method of electronic storage is 100% secure. While we strive to use
                  commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute
                  security.
                </p>
              </section>

              {/* Do Not Track */}
              <section id="do-not-track" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">
                  "Do Not Track" Signals under CalOPPA
                </h2>
                <p className="text-foreground">
                  Do Not Track is a preference you can set in your web browser to inform websites that you do
                  not want to be tracked. You can enable or disable Do Not Track by visiting the Preferences or
                  Settings page of your web browser.
                </p>
              </section>

              {/* Data Rights */}
              <section id="data-rights" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Your Data Protection Rights</h2>
                <p className="text-foreground mb-4">
                  Depending on where you reside, you may have certain data protection rights under applicable
                  data privacy laws. In certain circumstances, you have the following data protection rights:
                </p>
                <ul className="list-disc list-inside space-y-2 text-foreground ml-4">
                  <li>
                    The right to access, update or delete the information we have on you. Whenever made
                    possible, you can access, update or request deletion of your Personal Data directly within
                    your account settings section.
                  </li>
                  <li>
                    The right of rectification. You have the right to have your information rectified if that
                    information is inaccurate or incomplete.
                  </li>
                  <li>
                    The right to object. You have the right to object to our processing of your Personal Data.
                  </li>
                  <li>
                    The right of restriction. You have the right to request that we restrict the processing of
                    your personal information.
                  </li>
                  <li>
                    The right to data portability. You have the right to be provided with a copy of the
                    information we have on you in a structured, machine-readable and commonly used format.
                  </li>
                  <li>
                    The right to withdraw consent. You also have the right to withdraw your consent at any time
                    where Serenyax relied on your consent to process your personal information.
                  </li>
                </ul>
                <p className="text-foreground mt-4">
                  To exercise any such rights, please contact us at privacy@serenyax.com. Please note that we
                  may ask you to verify your identity before responding to such requests.
                </p>
              </section>

              {/* Service Providers */}
              <section id="service-providers" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Service Providers</h2>
                <p className="text-foreground mb-4">
                  We may employ third party companies and individuals to facilitate our Service ("Service
                  Providers"), provide the Service on our behalf, perform Service-related services or assist us
                  in analyzing how our Service is used.
                </p>
                <p className="text-foreground">
                  These third parties have access to your Personal Data only to perform these tasks on our
                  behalf and are obligated not to disclose or use it for any other purpose.
                </p>
              </section>

              {/* Links */}
              <section id="links" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Links to Other Sites</h2>
                <p className="text-foreground mb-4">
                  Our Service may contain links to other sites that are not operated by us. If you click a third
                  party link, you will be directed to that third party's site. We strongly advise you to review
                  the privacy policy of every site you visit.
                </p>
                <p className="text-foreground">
                  We have no control over and assume no responsibility for the content, privacy policies or
                  practices of any third party sites or services.
                </p>
              </section>

              {/* Children */}
              <section id="children" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Children's Privacy</h2>
                <p className="text-foreground mb-4">
                  Our Service does not address anyone under the age of 18 ("Children").
                </p>
                <p className="text-foreground">
                  We do not knowingly collect personally identifiable information from anyone under the age of
                  18. If you are a parent or guardian and you are aware that your Child has provided us with
                  Personal Data, please contact us. If we become aware that we have collected Personal Data from
                  children without verification of parental consent, we take steps to remove that information
                  from our servers.
                </p>
              </section>

              {/* Changes */}
              <section id="changes" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Changes to This Privacy Policy</h2>
                <p className="text-foreground mb-4">
                  We may update our Privacy Policy from time to time. We will notify you of any changes by
                  posting the new Privacy Policy on this page.
                </p>
                <p className="text-foreground mb-4">
                  We will let you know via email and/or a prominent notice on our Service, prior to the change
                  becoming effective and update the "effective date" at the top of this Privacy Policy.
                </p>
                <p className="text-foreground">
                  You are advised to review this Privacy Policy periodically for any changes. Changes to this
                  Privacy Policy are effective when they are posted on this page.
                </p>
              </section>

              {/* Contact */}
              <section id="contact" className="mb-12 scroll-mt-8">
                <h2 className="text-3xl font-bold text-foreground mb-6">Contact Us</h2>
                <p className="text-foreground mb-4">
                  If you have any questions about this Privacy Policy, please contact us:
                </p>
                <Card className="p-6 bg-muted/50 border-border">
                  <ul className="space-y-3 text-foreground">
                    <li>
                      <span className="font-semibold">By email:</span>{" "}
                      <a
                        href="mailto:privacy@serenyax.com"
                        className="text-primary hover:underline transition-colors"
                      >
                        privacy@serenyax.com
                      </a>
                    </li>
                    <li>
                      <span className="font-semibold">By website:</span>{" "}
                      <a
                        href="https://www.serenyax.com"
                        className="text-primary hover:underline transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        https://www.serenyax.com
                      </a>
                    </li>
                  </ul>
                </Card>
              </section>
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 mt-16">
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Serenyax. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicy;
