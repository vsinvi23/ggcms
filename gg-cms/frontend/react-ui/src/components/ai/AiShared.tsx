import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, MailWarning, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authService } from '@/api/services/authService';
import { aiErrorInfo } from './aiErrors';

export function AiDisclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      AI-generated. It can make mistakes, so check important details against the source.
    </p>
  );
}

export function AiErrorNotice({ error }: { error: unknown }) {
  const info = aiErrorInfo(error);
  return (
    <Alert variant="destructive" data-code={info.code}>
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <AlertDescription>
        {info.message} {info.hint}
      </AlertDescription>
    </Alert>
  );
}

export function VerifyEmailPrompt({ feature }: { feature: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const resend = async () => {
    setState('sending');
    try {
      await authService.resendVerification();
      setState('sent');
    } catch {
      setState('error');
    }
  };
  return (
    <Alert>
      <MailWarning className="h-4 w-4" aria-hidden="true" />
      <AlertDescription className="space-y-2">
        <p>Verify your email to use the {feature}.</p>
        <Button size="sm" variant="outline" onClick={resend} disabled={state === 'sending' || state === 'sent'}>
          {state === 'sent' ? 'Verification email sent' : 'Resend verification email'}
        </Button>
        <span role="status" className="ml-2 text-xs">
          {state === 'error' ? 'Could not send the email. Try again later.' : ''}
        </span>
      </AlertDescription>
    </Alert>
  );
}

const LINK_RE = /\[([^\]]{1,200})\]\(([^)\s]{1,500})\)/g;

const safeHref = (href: string): { kind: 'internal' | 'external'; href: string } | null => {
  if (href.startsWith('/') && !href.startsWith('//')) return { kind: 'internal', href };
  try {
    const u = new URL(href);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.origin === window.location.origin
        ? { kind: 'internal', href: u.pathname + u.search + u.hash }
        : { kind: 'external', href: u.toString() };
    }
  } catch {
    return null;
  }
  return null;
};

/** Renders model output as plain text. Only [text](url) links to http(s) or same-origin paths become anchors; no HTML is ever interpreted. */
export function SafeText({ text, className = '' }: { text: string; className?: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(LINK_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const target = safeHref(m[2]);
    if (!target) parts.push(m[1]);
    else if (target.kind === 'internal') {
      parts.push(<Link key={m.index} to={target.href} className="underline text-primary">{m[1]}</Link>);
    } else {
      parts.push(
        <a key={m.index} href={target.href} target="_blank" rel="noopener noreferrer nofollow" className="underline text-primary">
          {m[1]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}
    </p>
  );
}
