import { Fragment, useRef, useState, DragEvent } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useImportPreview, useImportConfirm } from '@/api/hooks/useImport';
import { useCategories } from '@/api/hooks/useCategories';
import { ImportPreviewItem, ImportSectionItem } from '@/api/services/importService';
import { ImportReviewRow } from '@/components/import/ImportReviewRow';
import { ImportArticleModal } from '@/components/import/ImportArticleModal';
import { parseBodyToBlocks } from '@/lib/htmlParser';
import { CategoryTreeSelect } from '@/components/import/CategoryTreeSelect';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Upload, FileText, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight, Download, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/errors';

const ACCEPTED_EXTENSIONS = '.md,.markdown,.json,.csv,.html,.htm,.zip';

const PASTE_FORMATS = [
  { value: 'md', label: 'Markdown', mime: 'text/markdown', ext: 'md' },
  { value: 'json', label: 'JSON', mime: 'application/json', ext: 'json' },
  { value: 'csv', label: 'CSV', mime: 'text/csv', ext: 'csv' },
  { value: 'html', label: 'HTML', mime: 'text/html', ext: 'html' },
];

const SAMPLE_TEMPLATES: Record<string, { filename: string; mime: string; content: string }> = {
  md: {
    filename: 'sample-article-template.md',
    mime: 'text/markdown;charset=utf-8;',
    content: `---
title: "Introduction to OAuth 2.0 & OpenID Connect"
description: "Comprehensive guide to modern identity and access management using OAuth2 flows and JWT tokens."
type: ARTICLE
category: backend
articleType: guide
tags: ["OAuth2", "Security", "JWT", "IAM"]
---

# Introduction to OAuth 2.0 & OpenID Connect

OAuth 2.0 is an industry-standard protocol for authorization. It focuses on client developer simplicity while providing specific authorization flows for web applications and microservices.

## Core Authorization Concepts

- **Resource Owner**: The user who grants access to a protected resource.
- **Client**: The application requesting access.
- **Authorization Server**: The server issuing access tokens to the client.
- **Resource Server**: The server hosting protected API resources.

## Example Authorization Code Flow

1. Client redirects user to Authorization Server.
2. User authenticates and grants permissions.
3. Authorization Server returns an authorization code.
4. Client exchanges authorization code for an access token.
`,
  },
  json: {
    filename: 'sample-content-template.json',
    mime: 'application/json;charset=utf-8;',
    content: JSON.stringify(
      [
        {
          type: 'ARTICLE',
          title: 'PostgreSQL Performance Tuning & Index Optimization',
          description: 'Learn EXPLAIN ANALYZE, B-Tree vs GIN indexes, and query optimization techniques.',
          categorySlug: 'database-architecture',
          articleType: 'tutorial',
          tags: ['PostgreSQL', 'Database', 'Performance', 'SQL'],
          body: '# PostgreSQL Performance Tuning\n\nProper indexing is essential for query speed and database efficiency.',
        },
        {
          type: 'COURSE',
          title: 'Mastering Microservices with Go & Cloud Run',
          description: 'End-to-end course on building scalable cloud-native microservices in Go.',
          categorySlug: 'software-engineering',
          courseType: 'full_course',
          tags: ['Go', 'Microservices', 'Cloud Run', 'Docker'],
          body: 'Welcome to the course overview. This track covers REST API design, gRPC, and deployment.',
          sections: [
            {
              title: 'Section 1: Go Microservices Architecture',
              order: 0,
              lessons: [
                {
                  title: 'Lesson 1.1: Project Setup & Clean Architecture',
                  type: 'text',
                  duration: 15,
                  order: 0,
                  body: 'In this lesson we set up domain models, services, and HTTP handlers.',
                },
                {
                  title: 'Lesson 1.2: Containerization with Docker',
                  type: 'text',
                  duration: 20,
                  order: 1,
                  body: 'Learn multi-stage Docker builds for minimal Go container images.',
                },
              ],
            },
          ],
        },
      ],
      null,
      2
    ),
  },
  csv: {
    filename: 'sample-import-template.csv',
    mime: 'text/csv;charset=utf-8;',
    content: `type,title,description,categorySlug,articleType,tags,body
ARTICLE,OWASP Top 10 LLM Security Risks,Overview of prompt injection and model denial of service.,ai-llm-security,guide,AI;Security;OWASP,# OWASP Top 10 LLM Security Risks...
ARTICLE,Docker Multi-Stage Build Best Practices,Optimize Docker image sizes for production services.,cloud-infrastructure,tutorial,Docker;DevOps;Cloud,# Docker Multi-Stage Build Best Practices...
`,
  },
  html: {
    filename: 'sample-article-template.html',
    mime: 'text/html;charset=utf-8;',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Kubernetes Ingress & TLS Termination Guide</title>
  <meta name="description" content="Step-by-step guide to setting up NGINX Ingress and Cert-Manager in Kubernetes.">
  <meta name="category" content="cloud-infrastructure">
  <meta name="article-type" content="guide">
  <meta name="tags" content="Kubernetes, DevOps, Ingress, TLS">
</head>
<body>
  <h1>Kubernetes Ingress & TLS Termination Guide</h1>
  <p>Kubernetes Ingress manages external access to services in a cluster, typically HTTP.</p>
  <h2>Key Prerequisites</h2>
  <ul>
    <li>Running Kubernetes Cluster</li>
    <li>kubectl configured</li>
  </ul>
</body>
</html>
`,
  },
};

async function parseFileClientSide(file: File, categories: { id: number; slug: string; name: string }[]): Promise<ImportPreviewItem[]> {
  const text = await file.text();
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const defaultCatId = categories.length > 0 ? categories[0].id : undefined;

  if (ext === '.json') {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.map((it, idx) => ({
        fileName: file.name,
        index: idx,
        type: (it.type || 'ARTICLE').toUpperCase(),
        title: it.title || file.name.replace(/\.[^/.]+$/, ''),
        description: it.description || '',
        body: typeof it.body === 'string' ? it.body : JSON.stringify(it.body || ''),
        bodyFormat: 'json',
        categorySlug: it.categorySlug || 'backend',
        categoryId: defaultCatId,
        articleType: it.articleType || 'guide',
        courseType: it.courseType || 'full_course',
        tags: Array.isArray(it.tags) ? it.tags : [],
        sections: Array.isArray(it.sections) ? it.sections : [],
        valid: true,
      }));
    } catch {
      // Fallback to text parsing
    }
  }

  // Markdown / Plain Text Parser
  let title = '';
  let description = '';
  let type = 'ARTICLE';
  let categorySlug = 'backend';
  let articleType = 'guide';
  let tags: string[] = [];
  let body = text;

  const trimmed = text.trim();
  if (trimmed.startsWith('---')) {
    const rest = trimmed.slice(3);
    const endIdx = rest.indexOf('---');
    if (endIdx !== -1) {
      const frontmatter = rest.slice(0, endIdx);
      body = rest.slice(endIdx + 3).trim();

      frontmatter.split('\n').forEach((line) => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim().toLowerCase();
          let val = parts.slice(1).join(':').trim();
          val = val.replace(/^["']|["']$/g, '');

          if (key === 'title') title = val;
          else if (key === 'description') description = val;
          else if (key === 'type') type = val.toUpperCase();
          else if (key === 'category' || key === 'categoryslug') categorySlug = val;
          else if (key === 'articletype') articleType = val;
          else if (key === 'tags') {
            tags = val
              .replace(/^\[|\]$/g, '')
              .split(',')
              .map((t) => t.trim().replace(/^["']|["']$/g, ''))
              .filter(Boolean);
          }
        }
      });
    }
  }

  if (!title) {
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      title = h1Match[1].trim();
    } else {
      title = file.name.replace(/\.[^/.]+$/, '');
    }
  }

  return [
    {
      fileName: file.name,
      index: 0,
      type,
      title,
      description,
      body,
      bodyFormat: ext === '.html' || ext === '.htm' ? 'html' : 'markdown',
      categorySlug,
      categoryId: defaultCatId,
      articleType,
      courseType: 'full_course',
      tags,
      sections: [],
      valid: true,
    },
  ];
}

export default function BulkImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<ImportPreviewItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload');
  const [pasteText, setPasteText] = useState('');
  const [pasteFormat, setPasteFormat] = useState('md');
  const [previewModalItem, setPreviewModalItem] = useState<ImportPreviewItem | null>(null);

  const handleDownloadSample = (format: keyof typeof SAMPLE_TEMPLATES) => {
    const sample = SAMPLE_TEMPLATES[format];
    if (!sample) return;
    const blob = new Blob([sample.content], { type: sample.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', sample.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${sample.filename}`);
  };

  const { data: categoriesData } = useCategories();
  const categories = (categoriesData ?? []).filter((c: { isVirtual?: boolean }) => !c.isVirtual);

  const preview = useImportPreview();
  const confirm = useImportConfirm();

  const runPreview = (files: File[]) => {
    if (files.length === 0) return;
    setConfirmed(false);
    preview.mutate(files, {
      onSuccess: (res) => {
        const processedItems = res.items.map((it) => {
          let categoryId = it.categoryId;
          let valid = it.valid;
          let error = it.error;

          if (!categoryId && it.categorySlug) {
            const slugLower = it.categorySlug.toLowerCase().trim();
            const matched = categories.find(
              (c: { id: number; slug: string; name: string }) =>
                c.slug.toLowerCase() === slugLower ||
                c.name.toLowerCase() === slugLower ||
                c.slug.toLowerCase().replace(/[^a-z0-9]/g, '') === slugLower.replace(/[^a-z0-9]/g, '')
            );
            if (matched) {
              categoryId = matched.id;
            } else if (categories.length > 0) {
              // Default to first category if categorySlug not matched
              categoryId = categories[0].id;
            }
          } else if (!categoryId && categories.length > 0) {
            categoryId = categories[0].id;
          }

          // Any document with a title and body or sections is valid for import
          if (it.title && (it.body || (it.sections && it.sections.length > 0))) {
            valid = true;
            error = undefined;
          }

          return { ...it, categoryId, valid, error };
        });

        setItems(processedItems);
        setSelected(new Set(processedItems.flatMap((it, i) => (it.valid ? [i] : []))));
        setExpanded(new Set());
      },
      onError: async () => {
        try {
          const clientParsedLists = await Promise.all(
            files.map((f) => parseFileClientSide(f, categories))
          );
          const flatItems = clientParsedLists.flat();
          if (flatItems.length > 0) {
            setItems(flatItems);
            setSelected(new Set(flatItems.map((_, i) => i)));
            setExpanded(new Set());
            toast.success(`Parsed ${flatItems.length} item${flatItems.length !== 1 ? 's' : ''}`);
            return;
          }
        } catch {
          // fall through
        }
        toast.error('Failed to parse content');
      },
    });
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    runPreview(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePastePreview = () => {
    if (!pasteText.trim()) {
      toast.error('Paste some content first');
      return;
    }
    const format = PASTE_FORMATS.find((f) => f.value === pasteFormat) ?? PASTE_FORMATS[0];
    const file = new File([pasteText], `pasted-content.${format.ext}`, { type: format.mime });
    runPreview([file]);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const toggleItem = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    const validIndices = items.flatMap((it, i) => (it.valid ? [i] : []));
    if (validIndices.every((i) => selected.has(i))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(validIndices));
    }
  };

  const updateItem = (idx: number, patch: Partial<ImportPreviewItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const updated = { ...it, ...patch };
        if (patch.categoryId !== undefined) {
          const hasTitle = Boolean(updated.title && updated.title.trim() !== '');
          const errorIsCatOnly = updated.error && updated.error.includes('category');
          if (errorIsCatOnly && hasTitle) {
            updated.error = undefined;
            updated.valid = true;
          }
        }
        return updated;
      })
    );
    if (patch.categoryId) {
      setSelected((prev) => new Set(prev).add(idx));
    }
  };

  const toggleExpanded = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Imported bodies arrive as raw markdown/HTML text (per bodyFormat), but the
  // rest of the app (ArticleCreator, CourseCreator, viewers) stores/reads body
  // as a JSON ContentBlock[] string. Converting here — the same parser used for
  // the preview tab — ensures imported content renders with proper headings,
  // paragraphs, lists, etc. instead of raw markdown/HTML text.
  const toStoredBody = (body: string, bodyFormat: string): string => {
    if (!body) return body;
    // bodyFormat here describes the *source file* the parser read (markdown/html/
    // json/csv-flat), not the shape of `body` itself — body is always plain
    // markdown-ish text except for the "html" source, which has real tags.
    const hint = bodyFormat === 'html' ? 'html' : 'markdown';
    const blocks = parseBodyToBlocks(body, hint);
    return JSON.stringify(blocks);
  };

  const convertSections = (sections: ImportSectionItem[], bodyFormat: string): ImportSectionItem[] =>
    sections.map((sec) => ({
      ...sec,
      lessons: sec.lessons.map((lesson) => ({
        ...lesson,
        body: toStoredBody(lesson.body, bodyFormat),
      })),
    }));

  const handleConfirm = () => {
    const toImport = items
      .filter((_, i) => selected.has(i))
      .map((it) => ({
        type: it.type,
        title: it.title,
        description: it.description,
        body: toStoredBody(it.body, it.bodyFormat),
        categoryId: it.categoryId,
        articleType: it.articleType,
        courseType: it.courseType,
        sections: it.type === 'COURSE' ? convertSections(it.sections ?? [], it.bodyFormat) : [],
      }));

    if (toImport.length === 0) {
      toast.error('Select at least one item to import');
      return;
    }

    confirm.mutate(toImport, {
      onSuccess: (res) => {
        setConfirmed(true);
        if (res.failed === 0) {
          toast.success(`${res.created} item${res.created !== 1 ? 's' : ''} imported as DRAFT`);
        } else {
          toast.warning(`${res.created} imported, ${res.failed} failed`);
        }
      },
      onError: (err) => toast.error(toUserMessage(err, 'Import failed')),
    });
  };

  const toggleExpandAll = () => {
    if (expanded.size === items.length) {
      setExpanded(new Set());
    } else {
      setExpanded(new Set(items.map((_, i) => i)));
    }
  };

  const validCount = items.filter((it) => it.valid).length;
  const selectedCount = selected.size;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Bulk Import</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload .md, .json, .csv, .html, or .zip archive files to import articles and courses as drafts.
          </p>
        </div>

        {/* Sample Templates Download Banner */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Need Sample Templates?</h3>
              <p className="text-xs text-muted-foreground">Download pre-formatted starter files, update your content, and upload.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => handleDownloadSample('md')} className="h-8 text-xs gap-1.5 bg-background">
              <Download className="w-3.5 h-3.5" /> .MD Sample
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDownloadSample('json')} className="h-8 text-xs gap-1.5 bg-background">
              <Download className="w-3.5 h-3.5" /> .JSON Sample
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDownloadSample('csv')} className="h-8 text-xs gap-1.5 bg-background">
              <Download className="w-3.5 h-3.5" /> .CSV Sample
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDownloadSample('html')} className="h-8 text-xs gap-1.5 bg-background">
              <Download className="w-3.5 h-3.5" /> .HTML Sample
            </Button>
          </div>
        </div>

        {/* Input mode */}
        <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'upload' | 'paste')}>
          <TabsList>
            <TabsTrigger value="upload">Upload files</TabsTrigger>
            <TabsTrigger value="paste">Paste content</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <div
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS}
                className="hidden"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => handleFiles(e.target.files)}
              />
              {preview.isPending ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Parsing files…</span>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop files or ZIP archives here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .md &nbsp;·&nbsp; .json &nbsp;·&nbsp; .csv &nbsp;·&nbsp; .html &nbsp;·&nbsp; .zip</p>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="paste">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Content format</label>
                <Select value={pasteFormat} onValueChange={setPasteFormat}>
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PASTE_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste Markdown, JSON, CSV, or HTML content here…"
                rows={12}
                className="font-mono text-xs"
              />
              <Button onClick={handlePastePreview} disabled={preview.isPending}>
                {preview.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing…</>
                ) : (
                  'Preview'
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Format guide */}
        {items.length === 0 && !preview.isPending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="flex flex-col justify-between">
              <div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Markdown (.md)</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground font-mono whitespace-pre">
{`---
title: "My Article"
type: ARTICLE
category: backend
description: Short summary
articleType: standard
tags: [go, api]
---

Body content here…

## Section: Getting started
### Lesson: Introduction
Lesson body (COURSE only)…`}
                </CardContent>
              </div>
              <CardContent className="pt-0">
                <Button variant="outline" size="sm" onClick={() => handleDownloadSample('md')} className="w-full text-xs gap-1.5 h-8">
                  <Download className="w-3.5 h-3.5" /> Download .md Template
                </Button>
              </CardContent>
            </Card>
            <Card className="flex flex-col justify-between">
              <div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> JSON (.json)</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground font-mono whitespace-pre">
{`[
  {
    "type": "COURSE",
    "title": "My Course",
    "categorySlug": "backend",
    "body": "Course overview…",
    "sections": [
      { "title": "Getting started", "order": 0,
        "lessons": [
          { "title": "Intro", "type": "text",
            "order": 0, "body": "Lesson body…" }
        ]
      }
    ]
  }
]`}
                </CardContent>
              </div>
              <CardContent className="pt-0">
                <Button variant="outline" size="sm" onClick={() => handleDownloadSample('json')} className="w-full text-xs gap-1.5 h-8">
                  <Download className="w-3.5 h-3.5" /> Download .json Template
                </Button>
              </CardContent>
            </Card>
            <Card className="flex flex-col justify-between">
              <div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> HTML (.html)</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground font-mono whitespace-pre">
{`<!DOCTYPE html>
<html>
<head>
  <title>My Article</title>
  <meta name="description" content="Summary">
  <meta name="category" content="frontend">
  <meta name="tags" content="html, web">
</head>
<body>
  <h1>Title</h1>
  <p>Article body content…</p>
</body>
</html>`}
                </CardContent>
              </div>
              <CardContent className="pt-0">
                <Button variant="outline" size="sm" onClick={() => handleDownloadSample('html')} className="w-full text-xs gap-1.5 h-8">
                  <Download className="w-3.5 h-3.5" /> Download .html Template
                </Button>
              </CardContent>
            </Card>
            <Card className="flex flex-col justify-between">
              <div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> CSV (.csv)</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground font-mono whitespace-pre">
{`type,title,categorySlug,description,articleType,body
ARTICLE,My Article,backend,Summary,standard,Body…
COURSE,My Course,frontend,,STANDARD,`}
                </CardContent>
                <CardContent className="text-xs text-muted-foreground pt-0">
                  Note: CSV course rows create an empty shell only.
                </CardContent>
              </div>
              <CardContent className="pt-0">
                <Button variant="outline" size="sm" onClick={() => handleDownloadSample('csv')} className="w-full text-xs gap-1.5 h-8">
                  <Download className="w-3.5 h-3.5" /> Download .csv Template
                </Button>
              </CardContent>
            </Card>
            <Card className="flex flex-col justify-between">
              <div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> ZIP Archives (.zip)</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Upload a single <strong>.zip</strong> archive containing multiple <code>.md</code>, <code>.json</code>, <code>.csv</code>, or <code>.html</code> files.
                  <br /><br />
                  Subdirectories are automatically unpacked and parsed. Non-content asset files inside the archive are safely ignored.
                </CardContent>
              </div>
              <CardContent className="pt-0">
                <Button variant="outline" size="sm" onClick={() => handleDownloadSample('md')} className="w-full text-xs gap-1.5 h-8">
                  <Download className="w-3.5 h-3.5" /> Download Starter File
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Preview table */}
        {items.length > 0 && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  Preview — {items.length} item{items.length !== 1 ? 's' : ''} parsed
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {validCount} valid · {items.length - validCount} invalid · {selectedCount} selected
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleExpandAll}
                >
                  {expanded.size === items.length ? 'Collapse All Previews' : 'Expand All Previews'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={selectedCount === 0 || confirm.isPending || confirmed}
                >
                  {confirm.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…</>
                  ) : (
                    `Import ${selectedCount} as Draft`
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={validCount > 0 && items.filter((it, i) => it.valid && selected.has(i)).length === validCount}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead className="w-44">Category</TableHead>
                    <TableHead className="w-24">File</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="w-24 text-right">Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <Fragment key={idx}>
                      <TableRow className={!item.valid ? 'opacity-60' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(idx)}
                            disabled={!item.valid}
                            onCheckedChange={() => toggleItem(idx)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => toggleExpanded(idx)}
                            title="Expand Content Edit Form"
                          >
                            {expanded.has(idx) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm flex items-center gap-2">
                            <span>{item.title || <span className="text-muted-foreground italic">untitled</span>}</span>
                            {!item.valid && (
                              <Badge variant="destructive" className="text-[10px] uppercase font-semibold">Wrong Format</Badge>
                            )}
                          </div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-xs">{item.description}</div>
                          )}
                          {item.error && (
                            <div className="text-xs text-destructive mt-0.5 font-mono">{item.error}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{item.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <CategoryTreeSelect
                            value={item.categoryId}
                            categorySlug={item.categorySlug}
                            onSelect={(catId) => updateItem(idx, { categoryId: catId })}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground truncate max-w-[100px] block" title={item.fileName}>
                            {item.fileName}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.valid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Badge variant="destructive" className="text-[10px] whitespace-nowrap">Wrong Format</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs gap-1 hover:bg-primary/10 hover:text-primary hover:border-primary/40 font-medium"
                            onClick={() => setPreviewModalItem(item)}
                            title="Open Educative actual view reader preview"
                          >
                            <Eye className="h-3.5 w-3.5 text-primary" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded.has(idx) && (
                        <TableRow>
                          <TableCell colSpan={8} className="p-0">
                            <ImportReviewRow item={item} onChange={(patch) => updateItem(idx, patch)} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Confirm results */}
        {confirmed && confirm.data && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {confirm.data.failed === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                )}
                Import complete — {confirm.data.created} created, {confirm.data.failed} failed
              </CardTitle>
            </CardHeader>
            {confirm.data.failed > 0 && (
              <CardContent className="text-xs space-y-1">
                {confirm.data.results.filter((r) => !r.success).map((r, i) => (
                  <div key={i} className="text-destructive">
                    <span className="font-medium">{r.title}</span>: {r.error}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        )}

        {/* Educative Actual View Import Preview Modal */}
        <ImportArticleModal
          open={!!previewModalItem}
          onOpenChange={(open) => !open && setPreviewModalItem(null)}
          item={previewModalItem}
        />
      </div>
    </DashboardLayout>
  );
}
