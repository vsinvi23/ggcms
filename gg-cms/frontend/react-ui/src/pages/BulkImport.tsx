import { Fragment, useRef, useState, useEffect, DragEvent } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Loader2,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Trash2,
  Bookmark,
  ArchiveRestore,
  RotateCcw,
  Sparkles,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/errors';
import JSZip from 'jszip';

const ACCEPTED_EXTENSIONS = '.md,.markdown,.json,.csv,.html,.htm,.zip';
const SAVED_IMPORTS_STORAGE_KEY = 'gg_saved_bulk_imports';

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
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const defaultCatId = categories.length > 0 ? categories[0].id : undefined;

  // Client-side ZIP unpacking fallback
  if (ext === '.zip') {
    try {
      const data = await file.arrayBuffer();
      const zipObj = await JSZip.loadAsync(data);
      const results: ImportPreviewItem[] = [];
      for (const entryName of Object.keys(zipObj.files)) {
        const entry = zipObj.files[entryName];
        if (entry.dir) continue;
        const baseName = entry.name.split('/').pop() || entry.name;
        if (entry.name.startsWith('__MACOSX/') || baseName.startsWith('._') || baseName === '.DS_Store' || baseName.startsWith('.')) continue;
        const entryExt = baseName.slice(baseName.lastIndexOf('.')).toLowerCase();
        if (['.md', '.markdown', '.json', '.csv', '.html', '.htm'].includes(entryExt)) {
          const blob = await entry.async('blob');
          const unzippedFile = new File([blob], baseName);
          const parsed = await parseFileClientSide(unzippedFile, categories);
          results.push(...parsed);
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  const text = await file.text();

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

  // Saved for Later items (persisted in localStorage)
  const [savedItems, setSavedItems] = useState<ImportPreviewItem[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_IMPORTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Keep localStorage synchronized whenever savedItems changes
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_IMPORTS_STORAGE_KEY, JSON.stringify(savedItems));
    } catch {
      // ignore storage quota errors
    }
  }, [savedItems]);

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
  const flatCategories = useMemo(() => {
    const flatten = (nodes: any[]): { id: number; slug: string; name: string }[] => {
      let list: { id: number; slug: string; name: string }[] = [];
      for (const node of nodes) {
        if (!node.isVirtual) {
          list.push({ id: node.id, slug: node.slug, name: node.name });
        }
        if (node.children && node.children.length > 0) {
          list = list.concat(flatten(node.children));
        }
      }
      return list;
    };
    return flatten(categoriesData ?? []);
  }, [categoriesData]);
  const categories = flatCategories;

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
            const matched = flatCategories.find(
              (c) =>
                c.slug.toLowerCase() === slugLower ||
                c.name.toLowerCase() === slugLower ||
                c.slug.toLowerCase().replace(/[^a-z0-9]/g, '') === slugLower.replace(/[^a-z0-9]/g, '')
            );
            if (matched) {
              categoryId = matched.id;
            } else if (flatCategories.length > 0) {
              // Default to first category if categorySlug not matched
              categoryId = flatCategories[0].id;
            }
          } else if (!categoryId && flatCategories.length > 0) {
            categoryId = flatCategories[0].id;
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
        toast.success(`Loaded ${processedItems.length} document${processedItems.length !== 1 ? 's' : ''} for preview`);
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
            toast.success(`Client parsed ${flatItems.length} item${flatItems.length !== 1 ? 's' : ''}`);
            return;
          }
        } catch {
          // fall through
        }
        toast.error('Failed to parse content');
      },
    });
  };

  // Handles dropped or selected files, unpacking any .zip archives on the client
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    const zipFiles = fileArray.filter((f) => f.name.toLowerCase().endsWith('.zip'));
    const nonZipFiles = fileArray.filter((f) => !f.name.toLowerCase().endsWith('.zip'));

    let extractedFiles: File[] = [];

    const MAX_ZIP_ENTRIES = 500;
    const MAX_SINGLE_UNCOMPRESSED_BYTES = 10 * 1024 * 1024; // 10MB
    const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;  // 50MB

    for (const zip of zipFiles) {
      try {
        const data = await zip.arrayBuffer();
        const zipObj = await JSZip.loadAsync(data);
        const entries = Object.keys(zipObj.files);

        // Security Check 1: Max entries limit
        if (entries.length > MAX_ZIP_ENTRIES) {
          toast.error(`Security alert: ${zip.name} contains ${entries.length} files (exceeds limit of ${MAX_ZIP_ENTRIES})`);
          continue;
        }

        let zipTotalBytes = 0;
        let zipExtractedCount = 0;
        let securityAborted = false;

        for (const entryName of entries) {
          const entry = zipObj.files[entryName];
          if (entry.dir) continue;

          // Security Check 2: Zip Slip / Path Traversal prevention
          if (
            entry.name.includes('../') ||
            entry.name.includes('..\\') ||
            entry.name.startsWith('/') ||
            entry.name.startsWith('\\')
          ) {
            toast.error(`Security alert: Path traversal attempt detected in ${entry.name}`);
            continue;
          }

          const baseName = entry.name.split('/').pop() || entry.name;
          if (
            entry.name.startsWith('__MACOSX/') ||
            baseName.startsWith('._') ||
            baseName === '.DS_Store' ||
            baseName.startsWith('.')
          ) {
            continue;
          }

          const ext = baseName.slice(baseName.lastIndexOf('.')).toLowerCase();
          // Security Check 3: Disallow recursive nested zip archives
          if (ext === '.zip') {
            continue;
          }

          if (['.md', '.markdown', '.json', '.csv', '.html', '.htm'].includes(ext)) {
            const content = await entry.async('blob');

            // Security Check 4: Single file decompression limit (10MB)
            if (content.size > MAX_SINGLE_UNCOMPRESSED_BYTES) {
              toast.error(`Security alert: File ${baseName} exceeds 10MB limit`);
              continue;
            }

            // Security Check 5: Total uncompressed size limit (50MB)
            zipTotalBytes += content.size;
            if (zipTotalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
              toast.error(`Security alert: Total uncompressed archive size in ${zip.name} exceeded 50MB`);
              securityAborted = true;
              break;
            }

            let mime = 'text/plain';
            if (ext === '.json') mime = 'application/json';
            else if (ext === '.csv') mime = 'text/csv';
            else if (ext === '.html' || ext === '.htm') mime = 'text/html';
            else if (ext === '.md' || ext === '.markdown') mime = 'text/markdown';

            const newFile = new File([content], baseName, { type: mime });
            extractedFiles.push(newFile);
            zipExtractedCount++;
          }
        }

        if (!securityAborted) {
          if (zipExtractedCount === 0) {
            toast.warning(`No readable content documents (.md, .json, .csv, .html) found in ${zip.name}`);
          } else {
            toast.success(`Unpacked ${zipExtractedCount} file${zipExtractedCount !== 1 ? 's' : ''} from ${zip.name}`);
          }
        }
      } catch (e) {
        console.error('ZIP extraction error:', e);
        toast.error(`Failed to extract zip: ${zip.name}`);
      }
    }

    const allFiles = [...nonZipFiles, ...extractedFiles];
    if (allFiles.length > 0) {
      runPreview(allFiles);
    }
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

  // Discard a single item from the active preview list
  const discardItem = (idx: number) => {
    const itemToDiscard = items[idx];
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setSelected((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
    setExpanded((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
    if (itemToDiscard) {
      toast.info(`Discarded "${itemToDiscard.title || itemToDiscard.fileName}"`);
    }
  };

  // Discard all selected items from active preview list
  const discardSelected = () => {
    if (selected.size === 0) return;
    const count = selected.size;
    setItems((prev) => prev.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
    setExpanded(new Set());
    toast.info(`Discarded ${count} selected item${count !== 1 ? 's' : ''}`);
  };

  // Save an item to confirm later (moves from items to savedItems)
  const saveItemForLater = (idx: number) => {
    const item = items[idx];
    if (!item) return;
    setSavedItems((prev) => [...prev, item]);
    discardItem(idx);
    toast.success(`Saved "${item.title || item.fileName}" for later`);
  };

  // Save all selected items for later
  const saveSelectedForLater = () => {
    if (selected.size === 0) return;
    const toSave = items.filter((_, i) => selected.has(i));
    setSavedItems((prev) => [...prev, ...toSave]);
    setItems((prev) => prev.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
    setExpanded(new Set());
    toast.success(`Saved ${toSave.length} item${toSave.length !== 1 ? 's' : ''} to confirm later`);
  };

  // Restore a saved item back to the active preview list
  const restoreSavedItem = (idx: number) => {
    const item = savedItems[idx];
    if (!item) return;
    setItems((prev) => [...prev, item]);
    setSavedItems((prev) => prev.filter((_, i) => i !== idx));
    setSelected((prev) => new Set(prev).add(items.length));
    toast.success(`Restored "${item.title || item.fileName}" to preview`);
  };

  // Restore all saved items to preview list
  const restoreAllSaved = () => {
    if (savedItems.length === 0) return;
    const count = savedItems.length;
    setItems((prev) => [...prev, ...savedItems]);
    setSavedItems([]);
    toast.success(`Restored ${count} saved item${count !== 1 ? 's' : ''} to preview`);
  };

  // Delete an item from the saved list permanently
  const deleteSavedItem = (idx: number) => {
    setSavedItems((prev) => prev.filter((_, i) => i !== idx));
    toast.info('Removed item from saved list');
  };

  // Clear all saved items
  const clearAllSaved = () => {
    setSavedItems([]);
    toast.info('Cleared all saved items');
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

  const toStoredBody = (body: string, bodyFormat: string): string => {
    if (!body) return body;
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
          // Remove imported items from the preview list
          setItems((prev) => prev.filter((_, i) => !selected.has(i)));
          setSelected(new Set());
          setExpanded(new Set());
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Bulk Import</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Upload .md, .json, .csv, .html, or .zip archive files to import articles and courses as drafts.
            </p>
          </div>

          {savedItems.length > 0 && (
            <Badge variant="outline" className="text-xs px-3 py-1 gap-1.5 border-primary/30 bg-primary/5 text-primary">
              <Bookmark className="w-3.5 h-3.5" />
              <span>{savedItems.length} saved for later</span>
            </Badge>
          )}
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
                  <span>Unpacking and parsing uploaded files…</span>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop files or ZIP archives here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .md &nbsp;·&nbsp; .json &nbsp;·&nbsp; .csv &nbsp;·&nbsp; .html &nbsp;·&nbsp; .zip archives</p>
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

        {/* Active Preview Table */}
        {items.length > 0 && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  Preview — {items.length} item{items.length !== 1 ? 's' : ''} parsed
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {validCount} valid · {items.length - validCount} invalid · {selectedCount} selected
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedCount > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveSelectedForLater}
                      className="text-xs h-8 gap-1 text-muted-foreground hover:text-foreground"
                      title="Move selected items to saved list"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-primary" /> Save Selected ({selectedCount})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={discardSelected}
                      className="text-xs h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      title="Discard selected items from preview"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Discard Selected ({selectedCount})
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleExpandAll}
                  className="text-xs h-8"
                >
                  {expanded.size === items.length ? 'Collapse All' : 'Expand All'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={selectedCount === 0 || confirm.isPending}
                  className="text-xs h-8"
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
                    <TableHead className="w-36 text-right">Actions</TableHead>
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
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary hover:border-primary/40 font-medium"
                              onClick={() => setPreviewModalItem(item)}
                              title="Open Educative actual view reader preview"
                            >
                              <Eye className="h-3.5 w-3.5 text-primary" /> View
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => saveItemForLater(idx)}
                              title="Save to confirm later"
                            >
                              <Bookmark className="h-3.5 w-3.5 text-primary" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => discardItem(idx)}
                              title="Discard document from preview"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded.has(idx) && (
                        <TableRow>
                          <TableCell colSpan={8} className="p-0">
                            <ImportReviewRow
                              item={item}
                              onChange={(patch) => updateItem(idx, patch)}
                              onDelete={() => discardItem(idx)}
                              onSaveForLater={() => saveItemForLater(idx)}
                            />
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

        {/* Saved for Later Section */}
        {savedItems.length > 0 && (
          <Card className="border-primary/20 bg-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-primary" />
                  Saved for Later ({savedItems.length})
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Documents saved to review and confirm at a later time.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={restoreAllSaved}
                  className="text-xs h-8 gap-1.5"
                >
                  <ArchiveRestore className="w-3.5 h-3.5 text-primary" /> Restore All to Preview
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAllSaved}
                  className="text-xs h-8 text-destructive hover:bg-destructive/10"
                >
                  Clear Saved
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead className="w-28">Category</TableHead>
                    <TableHead className="w-28">File</TableHead>
                    <TableHead className="w-36 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedItems.map((sItem, sIdx) => (
                    <TableRow key={sIdx}>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <span>{sItem.title || 'Untitled Document'}</span>
                          {sItem.valid ? (
                            <Badge variant="outline" className="text-[10px] text-green-600 bg-green-50/50">Valid</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">Wrong Format</Badge>
                          )}
                        </div>
                        {sItem.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-sm">{sItem.description}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{sItem.type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {sItem.categorySlug || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]" title={sItem.fileName}>
                        {sItem.fileName}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => setPreviewModalItem(sItem)}
                            title="Preview actual document view"
                          >
                            <Eye className="h-3.5 w-3.5 text-primary" /> View
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => restoreSavedItem(sIdx)}
                            title="Restore this document to active preview list"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => deleteSavedItem(sIdx)}
                            title="Delete from saved list"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
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
