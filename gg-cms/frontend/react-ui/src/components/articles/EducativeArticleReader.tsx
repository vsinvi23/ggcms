import { useMemo, useState, useEffect, useRef } from 'react';
import { parseBodyToBlocks, contentBlocksToHtml } from '@/lib/htmlParser';
import { sanitizeHtml } from '@/lib/sanitize';
import { slugify } from '@/lib/slug';
import { ImportSectionItem } from '@/api/services/importService';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  BookOpen,
  Clock,
  User,
  Tag,
  Layers,
  List,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

export interface EducativeArticleReaderProps {
  title?: string;
  description?: string;
  body?: string;
  bodyFormat?: string;
  type?: string;
  categorySlug?: string;
  articleType?: string;
  tags?: string[];
  sections?: ImportSectionItem[];
  readTimeMinutes?: number;
  authorName?: string;
  showToc?: boolean;
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export function EducativeArticleReader({
  title,
  description,
  body = '',
  bodyFormat = 'markdown',
  type = 'ARTICLE',
  categorySlug,
  articleType,
  tags = [],
  sections = [],
  readTimeMinutes = 5,
  authorName = 'GeekGully Content Team',
  showToc = true,
}: EducativeArticleReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({ 0: true });

  // Convert raw/json/html body into clean HTML snippet
  const renderedHtml = useMemo(() => {
    if (!body) return '';
    const hint = bodyFormat === 'html' ? 'html' : bodyFormat === 'json' ? 'json' : 'markdown';
    const blocks = parseBodyToBlocks(body, hint as 'json' | 'html' | 'markdown');
    return contentBlocksToHtml(blocks);
  }, [body, bodyFormat]);

  // Extract H2 and H3 headings for TOC
  useEffect(() => {
    if (!contentRef.current || !renderedHtml) {
      setTocEntries([]);
      return;
    }
    const container = contentRef.current;
    const headings = Array.from(container.querySelectorAll<HTMLElement>('h2, h3'));
    const seen = new Map<string, number>();

    const entries: TocEntry[] = headings.map((heading) => {
      const rawText = heading.textContent?.trim() || 'Heading';
      let id = slugify(rawText);
      const count = seen.get(id) ?? 0;
      seen.set(id, count + 1);
      if (count > 0) id = `${id}-${count}`;
      heading.id = id;
      return {
        id,
        text: rawText,
        level: heading.tagName === 'H3' ? 3 : 2,
      };
    });

    setTocEntries(entries);
    if (entries.length > 0) {
      setActiveHeadingId(entries[0].id);
    }
  }, [renderedHtml]);

  // Dynamically update active heading as user scrolls through the document
  useEffect(() => {
    if (tocEntries.length === 0) return;

    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const headingElements = tocEntries
            .map((entry) => document.getElementById(entry.id))
            .filter((el): el is HTMLElement => el !== null);

          if (headingElements.length === 0) {
            ticking = false;
            return;
          }

          const scrollPosition = window.scrollY || document.documentElement.scrollTop;
          const viewportHeight = window.innerHeight;
          const scrollHeight = document.documentElement.scrollHeight;

          // If near bottom of page, highlight last heading
          if (scrollPosition + viewportHeight >= scrollHeight - 60) {
            setActiveHeadingId(tocEntries[tocEntries.length - 1].id);
            ticking = false;
            return;
          }

          // Find the last heading whose top position is <= 140px
          let activeId = tocEntries[0].id;
          for (const heading of headingElements) {
            const rect = heading.getBoundingClientRect();
            if (rect.top <= 140) {
              activeId = heading.id;
            } else {
              break;
            }
          }
          setActiveHeadingId(activeId);
          ticking = false;
        });
        ticking = true;
      }
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    const container = contentRef.current?.closest('.overflow-y-auto');
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [tocEntries]);

  const handleTocClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveHeadingId(id);
    }
  };

  const toggleSection = (sIdx: number) => {
    setExpandedSections((prev) => ({ ...prev, [sIdx]: !prev[sIdx] }));
  };

  return (
    <div className="w-full bg-background text-foreground">
      {/* Top Banner Bar */}
      <div className="border-b border-border bg-muted/20 py-3 px-4 md:px-8 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-display font-medium flex items-center gap-1.5 px-2.5 py-0.5 text-xs bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="w-3.5 h-3.5" /> Educative Article Reader
          </Badge>
          <span className="text-muted-foreground font-mono uppercase text-[11px] bg-muted px-2 py-0.5 rounded">
            {type} • {bodyFormat}
          </span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span>{readTimeMinutes} min read</span>
          </div>
          {categorySlug && (
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span className="font-medium text-foreground">{categorySlug}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Container Layout */}
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-8 items-start">
          {/* Article Main Reading Body */}
          <main className="space-y-6 max-w-4xl w-full">
            {/* Header Title Section */}
            <header className="space-y-4 border-b border-border/80 pb-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="font-mono text-[11px] uppercase tracking-wider">
                  {type}
                </Badge>
                {articleType && (
                  <Badge variant="secondary" className="text-[11px] font-medium">
                    Type: {articleType}
                  </Badge>
                )}
                {categorySlug && (
                  <Badge variant="outline" className="text-[11px] bg-muted/40">
                    {categorySlug}
                  </Badge>
                )}
              </div>

              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold leading-tight tracking-tight text-foreground">
                {title || <span className="italic text-muted-foreground">Untitled Document</span>}
              </h1>

              {description && (
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-normal">
                  {description}
                </p>
              )}

              {/* Author & Tags Meta Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold font-display">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-medium text-foreground block">{authorName}</span>
                    <span className="text-[11px] text-muted-foreground">Author / Reviewer</span>
                  </div>
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {tags.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded text-foreground border border-border/50"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </header>

            {/* Course Overview / Lesson Outline (if COURSE type) */}
            {type === 'COURSE' && sections.length > 0 && (
              <Card className="p-5 border border-primary/20 bg-primary/5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-semibold text-base flex items-center gap-2 text-foreground">
                    <BookOpen className="w-4 h-4 text-primary" />
                    Course Syllabus & Lessons Outline ({sections.length} Section{sections.length !== 1 ? 's' : ''})
                  </h3>
                </div>
                <div className="space-y-3">
                  {sections.map((sec, sIdx) => {
                    const isOpen = expandedSections[sIdx] ?? true;
                    return (
                      <div key={sIdx} className="border border-border/70 rounded-lg bg-background overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleSection(sIdx)}
                          className="w-full px-4 py-3 bg-muted/30 hover:bg-muted/50 flex items-center justify-between text-left transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isOpen ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            <span className="font-display font-semibold text-sm">
                              Section {sIdx + 1}: {sec.title}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[11px] font-mono">
                            {sec.lessons?.length || 0} lessons
                          </Badge>
                        </button>
                        {isOpen && sec.lessons && sec.lessons.length > 0 && (
                          <div className="p-3 space-y-2 border-t border-border/50 bg-background">
                            {sec.lessons.map((les, lIdx) => (
                              <div
                                key={lIdx}
                                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/20 text-xs transition-colors"
                              >
                                <div className="flex items-center gap-2.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                                  <span className="font-medium text-foreground">{les.title}</span>
                                </div>
                                {les.duration && (
                                  <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                    {les.duration} min
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Article Content Rendered View */}
            {renderedHtml ? (
              <div
                ref={contentRef}
                className="educative-article-reader prose dark:prose-invert max-w-none space-y-4 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderedHtml) }}
              />
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground italic bg-muted/10 rounded-lg border border-dashed border-border">
                No body content available for this imported document.
              </div>
            )}
          </main>

          {/* Table of Contents Sidebar / Sticky Panel */}
          {showToc && (
            <aside className="sticky top-6 hidden lg:block space-y-4">
              <Card className="p-4 border border-border/80 bg-card space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                  <List className="w-4 h-4 text-primary shrink-0" />
                  <h4 className="font-display font-semibold text-xs tracking-wide uppercase text-foreground">
                    Table of Contents
                  </h4>
                </div>

                {tocEntries.length > 0 ? (
                  <nav className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-thin pr-1 text-xs">
                    {tocEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleTocClick(entry.id)}
                        className={`block w-full text-left py-1.5 px-2 rounded-md transition-colors truncate ${
                          entry.level === 3 ? 'pl-5 text-[11px]' : 'font-medium'
                        } ${
                          activeHeadingId === entry.id
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        }`}
                        title={entry.text}
                      >
                        {entry.text}
                      </button>
                    ))}
                  </nav>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No headings found in content body.
                  </p>
                )}
              </Card>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
