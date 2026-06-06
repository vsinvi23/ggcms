import { Link } from "react-router-dom";

const TermsConditions = () => {
  return (
    <div className="min-h-screen bg-background">
     
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-accent/10 py-16 border-b border-border">
  <div className="container mx-auto px-4 flex flex-col items-center justify-center pt-10">
    <h1 className="text-5xl font-bold text-foreground mb-4 text-center">
      Terms and Conditions
    </h1>
    <p className="text-xl text-muted-foreground max-w-3xl text-center">
      Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </p>
  </div>
</section>


      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-24 space-y-2">
              <h2 className="font-semibold text-foreground mb-4">Contents</h2>
              <nav className="space-y-1">
                {[
                  { id: "introduction", label: "Introduction" },
                  { id: "scope", label: "Scope of Work" },
                  { id: "proprietary", label: "Proprietary Rights" },
                  { id: "customer-warranties", label: "Customer Warranties" },
                  { id: "serenyax-warranty", label: "Serenyax Warranty" },
                  { id: "non-disclosure", label: "Non-Disclosure" },
                  { id: "indemnity", label: "Indemnity" },
                  { id: "limitation", label: "Limitation of Liability" },
                  { id: "term", label: "Term and Termination" },
                  { id: "no-hiring", label: "No Hiring" },
                  { id: "no-publicity", label: "No Publicity" },
                  { id: "assignment", label: "Assignment" },
                  { id: "authorization", label: "Authorization" },
                  { id: "general", label: "General" },
                ].map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block text-sm text-muted-foreground hover:text-primary transition-colors py-1 hover:translate-x-1 transform duration-200"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <main className="lg:col-span-3 prose prose-slate dark:prose-invert max-w-none">
            <section id="introduction" className="mb-12 scroll-mt-24">
              <div className="bg-card border border-border rounded-lg p-6 mb-8">
                <p className="text-foreground leading-relaxed">
                  Please read these Terms and Conditions ("Terms and Conditions" or "Terms") carefully before accessing the Services (as defined herein) offered by Serenyax.
                </p>
                <p className="text-foreground leading-relaxed mt-4">
                  By accessing the Services, you ("Customer") are subject to compliance with these Terms. By accessing the Services, Customer (and anyone representing Customer) agrees to be bound by these Terms. If any Customer (or their representative) disagrees with any part of these Terms, then that party may not use the Services.
                </p>
              </div>
            </section>

            <section id="scope" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">1. Scope of Work</h2>
              <p className="text-foreground leading-relaxed">
                Subject to the terms herein, Serenyax agrees to provide to Customer the services (the "Services"), including any Work Product (as defined herein), as are described by a separate statement of work ("SOW") to be executed by the Parties. In the event of a conflict, ambiguity, or inconsistency between these Terms and any SOW, the SOW will prevail.
              </p>
            </section>

            <section id="proprietary" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">2. Proprietary Rights</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">A. Deliverables</h3>
                  <p className="text-foreground leading-relaxed">
                    Deliverables shall constitute works for hire unless otherwise provided in a SOW. Accordingly, Serenyax agrees that, except as set forth in any applicable SOW, Customer exclusively owns such deliverables and any and all object code, source code, flow charts, documentation, information, reports, test results, findings, ideas and any and all works and other materials developed hereunder in connection with the provision of Services (collectively, the "Work Product") and that, except as set forth in an SOW, all right, title and interest to such Work Product shall vest in and remain with Customer. To the extent that title to any Work Product does not vest in Customer by operation of law, all rights and interests in the Work Product are hereby irrevocably assigned to Customer.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">B. General Skills</h3>
                  <p className="text-foreground leading-relaxed">
                    Notwithstanding Section 2(A), each Party, its employees and subcontractors shall be free to use and employ their general skills, know-how, and expertise, and to use, disclose, and employ any generalized ideas, concepts, know-how, methods, discoveries, techniques, or skills gained or learned during the course of any Services performed hereunder, subject to its obligations respecting Customer's confidential information pursuant to Section 6 and provided that Serenyax, its employees, and subcontractors do not use or reference any Work Product or other Customer confidential information in so doing.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">C. Price and Payment</h3>
                  <p className="text-foreground leading-relaxed">
                    Unless otherwise provided in the relevant SOW, all invoices shall be due within thirty (30) days of the date of each invoice. Customer agrees to pay the amount due in full, without deduction or setoff of any kind, in U.S. Dollars. All amounts due shall be paid by check or wire transfer, as set forth in the applicable invoice, unless an alternative method is set forth in the relevant SOW.
                  </p>
                </div>
              </div>
            </section>

            <section id="customer-warranties" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">3. Customer Warranties</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">A. Information and Access</h3>
                  <p className="text-foreground leading-relaxed">
                    Customer represents and warrants that it will provide Serenyax with: (i) accurate information concerning Customer Assets (as defined herein), and (ii) all access and cooperation reasonably necessary to facilitate the Services. If Customer fails or delays in its performance of any of the foregoing, Serenyax shall be relieved of its obligations under these Terms or any SOW to the extent such delays or failures impede Serenyax's ability to perform its obligations.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">B. Ownership and Authority</h3>
                  <p className="text-foreground leading-relaxed">
                    Customer represents and warrants that (i) it owns and controls, directly or indirectly, all of the Customer Assets, or that all such Customer Assets are provided for Customer's use by a third party, (ii) it has authorized Serenyax to access such Customer Assets to perform the Services, (iii) it has full power and authority to engage and direct Serenyax to access Customer Assets and to conduct the Services, (iv) except as has been obtained previously, no consent, approval, authorization or other notice to a third party (including but not limited to employees, contractors, sub-contractors, and other entities with access to Customer's assets) are required in connection with Serenyax's performance of the Services, and (v) its use of the Services will comply with all applicable laws, regulations, ordinances.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">C. Customer Assets Definition</h3>
                  <p className="text-foreground leading-relaxed">
                    As used herein, "Customer Assets" means Customer's physical premises and/or Customer's systems (including, without limitation all computer and telecommunications equipment, including servers, workstations, laptops, and associated attachments, accessories, peripheral devices and other equipment and/or applications and software (whether owned or licensed)) that Serenyax may be directed to access in performance of the Services.
                  </p>
                </div>
              </div>
            </section>

            <section id="serenyax-warranty" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">4. Serenyax Warranty and Disclaimer</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">A. Rights and Licenses</h3>
                  <p className="text-foreground leading-relaxed">
                    Serenyax represents and warrants that: (i) Serenyax has obtained or shall obtain and maintain all rights, licenses, consents and authorizations necessary to perform its obligations and adhere to the all of the terms and conditions set forth in these Terms; and (ii) the Services, Work Product and any and all other information do not and will not violate or infringe upon any copyright, patent, trademark, trade secret or other intellectual property right or any third party.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">B. Professional Standards</h3>
                  <p className="text-foreground leading-relaxed">
                    Serenyax represents and warrants that: (i) the Services shall be performed and the Work Product shall be delivered in a timely, professional, and workmanlike manner in accordance with industry standards; (ii) the Materials shall conform to, perform and be provided in accordance with all specifications, descriptions, requirements and criteria set forth or otherwise referred to in these Terms and/or the applicable SOW; and (iii) Serenyax shall perform all work called for under these Terms and any applicable SOW in accordance with all applicable laws, regulations, and ordinances, including but not limited to all applicable anti-corruption laws.
                  </p>
                </div>

                <div className="bg-muted/50 border border-border rounded-lg p-6">
                  <h3 className="text-xl font-semibold text-foreground mb-3">C. DISCLAIMER</h3>
                  <p className="text-foreground leading-relaxed font-medium">
                    THE FOREGOING WARRANTIES ARE SERENYAX'S ONLY WARRANTIES CONCERNING THE SERVICES AND WORK PRODUCT AND ARE MADE IN LIEU OF ALL OTHER WARRANTIES AND REPRESENTATIONS, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE OR OTHERWISE. CUSTOMER ACKNOWLEDGES, UNDERSTANDS AND AGREES THAT SERENYAX DOES NOT GUARANTEE OR WARRANTY THAT IT WILL FIND, LOCATE OR DISCOVER ALL OF CUSTOMER'S SYSTEM VULNERABILITIES, SYSTEM WEAKNESSES, AND/OR SYSTEM COMPROMISES AND WILL NOT HOLD SERENYAX RESPONSIBLE THEREFOR. CUSTOMER AGREES NOT TO REPRESENT TO ANY THIRD PARTY THAT SERENYAX HAS PROVIDED ANY SUCH GUARANTEE OR WARRANTY.
                  </p>
                </div>
              </div>
            </section>

            <section id="non-disclosure" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">5. Non-Disclosure</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">A. Disclosures</h3>
                  <p className="text-foreground leading-relaxed">
                    "Confidential Information" includes, without limitation, all technical and non-technical information provided by a Party ("Disclosing Party") to the other Party ("Receiving Party") that should reasonably be considered confidential, given the nature of the information or the circumstances surrounding its disclosure. The Receiving Party will not: (i) use any Confidential Information except as necessary to perform obligations or exercise rights under these Terms; or (ii) disclose any Confidential Information of the Disclosing Party to any person or entity, except to those who are involved in performing these Terms, have a need to know, and have signed a non-disclosure agreement with terms no less restrictive than those herein.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">B. Exclusions</h3>
                  <p className="text-foreground leading-relaxed">
                    The restrictions in this section will not apply to any information that is: (i) already known to Receiving Party before receipt from Disclosing Party; (ii) publicly available through no fault of Receiving Party (or those to whom Receiving Party has properly disclosed such information under these Terms); (iii) rightfully received by Receiving Party from a third party, provided the Receiving Party has no reason to believe that the third party is or may be bound by a confidentiality agreement with the Disclosing Party; (iv) independently developed by Receiving Party without the use of any Confidential Information; or (v) approved for release by written authorization of the Disclosing Party.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">C. Return of Materials</h3>
                  <p className="text-foreground leading-relaxed">
                    Promptly following the earlier of a request by the Disclosing Party or upon expiration or any termination of these Terms, the Receiving Party will, upon request, promptly securely and permanently destroy or return the Disclosing Party's Confidential Information in its control and all copies thereof and provide the requesting Party with written confirmation of the same.
                  </p>
                </div>
              </div>
            </section>

            <section id="indemnity" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">6. Indemnity</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">A. Mutual Indemnification</h3>
                  <p className="text-foreground leading-relaxed">
                    Each Party (as "Indemnifying Party") shall indemnify, hold harmless, and defend the other Party and its officers, directors, employees, agents, affiliates, successors and permitted assigns (collectively, "Indemnified Party") against any and all losses, damages, liabilities, deficiencies, claims, actions, judgments, settlements, interest, awards, penalties, fines, costs, or expenses of whatever kind, including reasonable attorneys' fees, that are incurred by Indemnified Party (collectively, "Losses"), arising out of any third-party claim alleging any grossly negligence or willful misconduct of Indemnifying Party in connection with the performance of its obligations under these Terms.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">B. Serenyax Indemnification</h3>
                  <p className="text-foreground leading-relaxed">
                    In addition to the indemnification obligations set forth above, Serenyax, as Indemnifying Party, hereby agrees to indemnify, hold harmless and defend Indemnified Party from all Losses which may be sustained by Indemnified Party for an infringement of any United States patent, trademark, trade secret, copyright, or other intellectual property by Indemnifying Party.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">C. Customer Indemnification</h3>
                  <p className="text-foreground leading-relaxed">
                    In addition to the indemnification obligations set forth above, Customer, as Indemnifying Party, hereby agrees to indemnify, hold harmless and defend Indemnified Party from all Losses which may be sustained by Indemnified Party from Indemnifying Party's providing incorrect information regarding the Customer Assets and Indemnifying Party's ownership of any Customer Assets.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">D. Indemnification Procedures</h3>
                  <p className="text-foreground leading-relaxed">
                    Each Indemnifying Party's indemnification obligations hereunder shall be conditioned upon the Indemnified Party providing the Indemnifying Party with: (a) prompt written notice of any claim (provided that a failure to provide such notice shall only relieve the Indemnitor of its indemnity obligations if the Indemnifying Party is materially prejudiced by such failure); (b) the option to assume sole control over the defence and settlement of any claim (provided that the Indemnified Party may participate in such defence and settlement at its own expense); and (c) reasonable information and assistance in connection with such defence and settlement (at the Indemnifying Party's expense).
                  </p>
                </div>
              </div>
            </section>

            <section id="limitation" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">7. Limitation of Liability</h2>
              <div className="bg-muted/50 border border-border rounded-lg p-6">
                <p className="text-foreground leading-relaxed font-medium">
                  EXCEPT FOR THE PARTIES' OBLIGATIONS UNDER SECTION 7 (INDEMNIFICATION), IN NO EVENT SHALL: (I) EITHER PARTY BE LIABLE TO THE OTHER PARTY FOR ANY CONSEQUENTIAL, INCIDENTAL, PUNITIVE, SPECIAL, EXEMPLARY OR INDIRECT DAMAGES (INCLUDING LOST PROFITS OR SAVINGS), EVEN IF SUCH PARTY WAS ADVISED OF THE POSSIBILITY OF THE OCCURRENCE OF SUCH DAMAGES; OR (II) EITHER PARTY'S LIABILITY TO THE OTHER PARTY ARISING OUT OF THESE TERMS EXCEED AN AMOUNT EQUAL TO THE TOTAL FEES PAID TO SERENYAX UNDER THE SOW UNDER WHICH SUCH LIABILITY ARISES.
                </p>
              </div>
            </section>

            <section id="term" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">8. Term and Termination</h2>
              
              <div className="space-y-4">
                <p className="text-foreground leading-relaxed">
                  <strong>A.</strong> These Terms shall continue in full force and effect until terminated in accordance with the provisions hereof.
                </p>
                <p className="text-foreground leading-relaxed">
                  <strong>B.</strong> Either Party may terminate these Terms for cause upon 30 calendar days' prior written notice to the other party of a material breach by the other party, if such breach remains uncured at the end of such period.
                </p>
                <p className="text-foreground leading-relaxed">
                  <strong>C.</strong> Either Party may terminate these Terms for convenience upon 5 business days' prior written notice to the other Party provided that all applicable SOWs have: (i) been completed, (ii) expired, or (iii) been terminated in accordance with the terms of such SOWs.
                </p>
                <p className="text-foreground leading-relaxed">
                  <strong>D.</strong> All provisions which, by their nature, should survive the termination of these Terms shall so survive.
                </p>
              </div>
            </section>

            <section id="no-hiring" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">9. No Hiring</h2>
              <p className="text-foreground leading-relaxed">
                During the term hereof and for one year thereafter, neither Party shall solicit for employment any employee of the other who is involved in providing or utilizing the Services, except in the case of general announcements for employment.
              </p>
            </section>

            <section id="no-publicity" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">10. No Publicity</h2>
              <p className="text-foreground leading-relaxed">
                Serenyax's work for Customer is confidential and intended for the Customer's internal use only. Serenyax does not make public customer names, customer materials, or reports prepared for customers without their prior written permission. Similarly, the Customer agrees that it will not use Serenyax's name, refer to Serenyax's work, or make the deliverables or the existence or terms of these Terms available outside its organization without Serenyax's prior written permission. Neither party will have any right to use the names, logos, symbols and/or any other trademarks of the other party, without prior written permission from such other party.
              </p>
            </section>

            <section id="assignment" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">11. Assignment</h2>
              <p className="text-foreground leading-relaxed">
                These Terms shall be binding upon the Parties' respective successors and permitted assigns. Neither party may assign these Terms or any of its rights or obligations hereunder without the prior written consent of the other party, except that either party may, without such consent, assign these Terms in its entirety to such party's successor in interest in connection with a merger, acquisition, reorganization, or consolidation of such party, or the sale of substantially all of such party's assets to which these Terms pertain.
              </p>
            </section>

            <section id="authorization" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">12. Authorization</h2>
              <p className="text-foreground leading-relaxed">
                Customer hereby agrees that Serenyax is being retained to protect Customer's rights and property and that the Services shall be deemed authorized for purposes of all applicable laws, rules and regulations that relate to, regulate, or impact the subject matter of these Terms.
              </p>
            </section>

            <section id="general" className="mb-12 scroll-mt-24">
              <h2 className="text-3xl font-bold text-foreground mb-4">13. General</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">A. Governing Law</h3>
                  <p className="text-foreground leading-relaxed">
                    These Terms shall be governed by and construed in accordance with the internal laws of the State of Delaware (without regard to principles of conflicts of law).
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">B. Waiver</h3>
                  <p className="text-foreground leading-relaxed">
                    All waivers must be in writing. A failure of either party to exercise any right provided for herein, shall not be deemed to be a waiver of any right hereunder. A party's consent to, or waiver of, enforcement of these Terms on one occasion will not be deemed a waiver of any other provision or such provision on any other occasion.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">C. Entire Agreement</h3>
                  <p className="text-foreground leading-relaxed">
                    These Terms set forth the entire understanding of the Parties as to the subject matter herein and may not be modified except in writing executed by both Parties.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">D. Remedies</h3>
                  <p className="text-foreground leading-relaxed">
                    The rights and remedies of the parties as set forth herein are not exclusive and are in addition to any other rights and remedies available to it in law or in equity.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">E. Notices</h3>
                  <p className="text-foreground leading-relaxed">
                    Notices will be sent either by first-class, registered mail or overnight courier to the address set forth above and will be deemed given 72 hours after mailing or upon confirmed delivery or confirmed receipt.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">F. Independent Contractors</h3>
                  <p className="text-foreground leading-relaxed">
                    No joint venture, partnership, employment, or agency relationship exists between the parties as a result of these Terms or use of the Services. There are no third-party beneficiaries under these Terms.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">G. Severability</h3>
                  <p className="text-foreground leading-relaxed">
                    If a court of competent jurisdiction adjudges any provision of these Terms to be invalid or unenforceable, the remaining provisions of these Terms, if capable of substantial performance, will continue in full force and effect without being impaired or invalidated in any way. The parties agree to replace any invalid provision with a valid provision that most closely approximates the intent and economic effect of the invalid provision.
                  </p>
                </div>
              </div>
            </section>

            {/* Contact Section */}
            <section className="mt-16 bg-card border border-border rounded-lg p-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">Questions?</h2>
              <p className="text-foreground leading-relaxed mb-4">
                If you have any questions about these Terms and Conditions, please contact us at:
              </p>
              <p className="text-primary font-medium">
                <a href="mailto:legal@serenyax.com" className="hover:underline">
                  legal@serenyax.com
                </a>
              </p>
            </section>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} Serenyax. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link to="/privacy-policy" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
                Terms & Conditions
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TermsConditions;
