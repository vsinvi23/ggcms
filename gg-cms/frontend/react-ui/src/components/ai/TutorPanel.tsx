import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bot, History, Loader2, SendHorizontal, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAiFeature, useDeleteConversation, useTutorAsk, useTutorConversation, useTutorConversations, useTutorFeedback,
} from '@/api/hooks/useAi';
import { AiCitation, AiContentType, TutorMessage } from '@/api/types';
import { AiDisclaimer, AiErrorNotice, SafeText, VerifyEmailPrompt } from './AiShared';
import { aiErrorInfo, normalizeCitationUrl } from './aiErrors';

interface Props {
  contentType: AiContentType;
  contentId: number;
  className?: string;
}

const MIN_Q = 3;
const MAX_Q = 1000;

function Citations({ citations, contentType }: { citations: AiCitation[]; contentType: AiContentType }) {
  if (!citations.length) return null;
  return (
    <ol className="mt-2 space-y-1 text-xs" aria-label="Sources">
      {citations.map((c, i) => {
        const href = normalizeCitationUrl(c.url, c.contentType ?? contentType);
        const label = c.heading ? `${c.title} - ${c.heading}` : c.title;
        return (
          <li key={`${c.id}-${i}`}>
            <span className="text-muted-foreground">[{i + 1}] </span>
            {href ? <Link to={href} className="underline text-primary">{label}</Link> : <span>{label}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function TutorPanel({ contentType, contentId, className }: Props) {
  const { visible, needsVerification } = useAiFeature('tutor');
  const [question, setQuestion] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [limitReached, setLimitReached] = useState(false);
  const lastAnswerRef = useRef<HTMLDivElement>(null);
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);

  const ask = useTutorAsk();
  const feedback = useTutorFeedback();
  const del = useDeleteConversation();
  const conversations = useTutorConversations(visible && showHistory);
  const resumed = useTutorConversation(showHistory ? conversationId : null);

  const scoped = useMemo(
    () => (conversations.data ?? []).filter((c) => !c.contentType || (c.contentType === contentType && c.contentId === contentId)),
    [conversations.data, contentType, contentId],
  );

  const resumedMessages = resumed.data?.messages;
  useEffect(() => {
    if (resumedMessages) setMessages(resumedMessages);
  }, [resumedMessages]);

  useEffect(() => {
    lastAnswerRef.current?.focus();
  }, [messages.length]);

  if (needsVerification) return <VerifyEmailPrompt feature="AI tutor" />;
  if (!visible) return null;

  const trimmed = question.trim();
  const valid = trimmed.length >= MIN_Q && trimmed.length <= MAX_Q;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || ask.isPending || limitReached) return;
    setError(null);
    const q = trimmed;
    try {
      const res = await ask.mutateAsync({ contentType, contentId, question: q, conversationId: conversationId ?? undefined });
      setConversationId(res.conversationId);
      setMessages((m) => [
        ...m,
        { id: -m.length - 1, role: 'user', content: q },
        { id: res.messageId, role: 'assistant', content: res.answer, grounded: res.grounded, citations: res.citations },
      ]);
      setQuestion('');
    } catch (err) {
      setError(err);
      if (aiErrorInfo(err).code === 'AI_DAILY_LIMIT') setLimitReached(true);
    }
  };

  const rate = (messageId: number, rating: 1 | -1) => {
    setRatings((r) => ({ ...r, [messageId]: rating }));
    feedback.mutate({ messageId, rating }, { onError: () => setRatings((r) => { const n = { ...r }; delete n[messageId]; return n; }) });
  };

  const resume = (id: string) => {
    setConversationId(id);
    setShowHistory(true);
  };

  const shown = messages;

  const remove = async (id: string) => {
    await del.mutateAsync(id);
    if (id === conversationId) {
      setConversationId(null);
      setMessages([]);
    }
    historyHeadingRef.current?.focus();
  };

  const newChat = () => {
    setConversationId(null);
    setMessages([]);
    setError(null);
  };

  return (
    <Card aria-labelledby="tutor-title" className={`border-border ${className ?? ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle id="tutor-title" className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" aria-hidden="true" /> Ask the AI tutor
          </CardTitle>
          <Button size="sm" variant="ghost" aria-expanded={showHistory} onClick={() => setShowHistory((s) => !s)}>
            <History className="mr-1 h-4 w-4" aria-hidden="true" /> History
          </Button>
        </div>
        <AiDisclaimer />
      </CardHeader>
      <CardContent className="space-y-3">
        {showHistory && (
          <section aria-label="Conversation history" className="rounded-md border p-2">
            <h3 ref={historyHeadingRef} tabIndex={-1} className="mb-1 text-sm font-medium">Past conversations</h3>
            {conversations.isLoading && <p className="text-xs text-muted-foreground">Loading conversations...</p>}
            {conversations.isError && <AiErrorNotice error={conversations.error} />}
            {conversations.isSuccess && scoped.length === 0 && <p className="text-xs text-muted-foreground">No past conversations yet.</p>}
            <ul className="space-y-1">
              {scoped.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <button type="button" className="truncate text-left underline-offset-2 hover:underline" onClick={() => resume(c.id)}>
                    {c.title || 'Untitled conversation'}
                  </button>
                  <Button size="icon" variant="ghost" aria-label={`Delete conversation ${c.title || ''}`.trim()} onClick={() => remove(c.id)} disabled={del.isPending}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
            {resumed.isLoading && <p className="text-xs text-muted-foreground">Loading conversation...</p>}
            {resumed.isError && <AiErrorNotice error={resumed.error} />}
          </section>
        )}

        <div aria-live="polite" aria-relevant="additions" className="space-y-3">
          {shown.map((m, i) => (
            <div
              key={`${m.id}-${i}`}
              ref={i === shown.length - 1 ? lastAnswerRef : undefined}
              tabIndex={i === shown.length - 1 ? -1 : undefined}
              className={m.role === 'user' ? 'rounded-md bg-muted p-2 text-sm' : 'rounded-md border p-2 text-sm'}
            >
              <span className="sr-only">{m.role === 'user' ? 'You asked: ' : 'Tutor answer: '}</span>
              {m.role === 'assistant' && m.grounded === false && (
                <p className="mb-1 font-medium text-amber-700 dark:text-amber-400">
                  Not enough information in this {contentType} to answer that.
                </p>
              )}
              <SafeText text={m.content} />
              {m.role === 'assistant' && m.grounded !== false && <Citations citations={m.citations ?? []} contentType={contentType} />}
              {m.role === 'assistant' && m.id > 0 && (
                <div className="mt-2 flex items-center gap-1" role="group" aria-label="Rate this answer">
                  <Button size="icon" variant="ghost" aria-label="Helpful" aria-pressed={(ratings[m.id] ?? m.rating) === 1} onClick={() => rate(m.id, 1)}>
                    <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Not helpful" aria-pressed={(ratings[m.id] ?? m.rating) === -1} onClick={() => rate(m.id, -1)}>
                    <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {ask.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Thinking...
            </p>
          )}
        </div>

        {!!error && <AiErrorNotice error={error} />}
        {limitReached && <p className="text-xs text-muted-foreground" role="status">Daily question limit reached. Come back tomorrow.</p>}
        {shown.length === 0 && !ask.isPending && !error && (
          <p className="text-sm text-muted-foreground">Ask a question about this {contentType}. Answers use only its content and cite their sources.</p>
        )}

        <form onSubmit={submit} className="space-y-2">
          <label htmlFor="tutor-question" className="sr-only">Your question</label>
          <Textarea
            id="tutor-question"
            value={question}
            maxLength={MAX_Q}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Ask about this ${contentType}...`}
            className="min-h-[70px] resize-none"
            disabled={limitReached}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{trimmed.length}/{MAX_Q}</span>
            <div className="flex gap-2">
              {shown.length > 0 && <Button type="button" size="sm" variant="outline" onClick={newChat}>New chat</Button>}
              <Button type="submit" size="sm" disabled={!valid || ask.isPending || limitReached}>
                <SendHorizontal className="mr-1 h-4 w-4" aria-hidden="true" /> Ask
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
