import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SUPPORT_EMAIL } from '@/config/api';
import { usePageMeta } from '@/hooks/usePageMeta';

const steps = [
  { title: 'Browse content', body: 'Use Explore, Courses and Learning Paths to find something to learn. No account is needed to read published content.', to: '/explore', cta: 'Open Explore' },
  { title: 'Create an account', body: 'Sign up to open course lessons, track your progress and save notes and highlights.', to: '/auth', cta: 'Sign up or sign in' },
  { title: 'Practice and prepare', body: 'Use Practice and Interview Prep to test yourself on what you have learned.', to: '/practice', cta: 'Open Practice' },
];

const faqs = [
  { q: 'Do I need an account to read articles?', a: 'No. Published articles and course overviews are public. Opening course lessons and saving progress requires you to sign in.' },
  { q: 'I signed up but cannot sign in yet.', a: 'New accounts may need to be verified before you can sign in. Check the message shown after signing up and follow any instructions in it.' },
  { q: 'I forgot my password.', a: 'Use the "Forgot password" link on the sign-in page to request a reset.' },
  { q: 'How do I change my password or manage linked accounts?', a: 'Open Account settings from your profile menu. Password changes and connected sign-in methods are managed there.' },
  { q: 'How do I find content on a specific topic?', a: 'Use the search bar, or browse by Technologies and Topics from the Explore page.' },
];

export default function HelpPage() {
  usePageMeta({ title: 'Help', description: 'How to get started, answers to common questions and how to get in touch.', canonicalPath: '/help' });

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Help</h1>
          <p className="text-muted-foreground">How to get started, answers to common questions and how to get in touch.</p>
        </header>

        <section className="space-y-4" aria-labelledby="help-start">
          <h2 id="help-start" className="text-xl font-bold">How to get started</h2>
          <div className="grid gap-4">
            {steps.map((s, i) => (
              <Card key={s.title}>
                <CardHeader>
                  <CardTitle className="text-base">{i + 1}. {s.title}</CardTitle>
                  <CardDescription>{s.body}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to={s.to} className="text-sm font-semibold text-primary underline">{s.cta}</Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="help-faq">
          <h2 id="help-faq" className="text-xl font-bold">Frequently asked questions</h2>
          <Accordion type="single" collapsible>
            {faqs.map((f, i) => (
              <AccordionItem key={f.q} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {SUPPORT_EMAIL && (
          <section className="space-y-2" aria-labelledby="help-contact">
            <h2 id="help-contact" className="text-xl font-bold">Contact</h2>
            <p className="text-muted-foreground">
              Still stuck? Email <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </p>
          </section>
        )}
      </div>
    </PublicLayout>
  );
}
