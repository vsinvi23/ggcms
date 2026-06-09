import { useRef, useState, DragEvent } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useImportPreview, useImportConfirm } from '@/api/hooks/useImport';
import { useCategories } from '@/api/hooks/useCategories';
import { ImportPreviewItem } from '@/api/services/importService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Upload, FileText, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const ACCEPTED_EXTENSIONS = '.md,.markdown,.json,.csv';

export default function BulkImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<ImportPreviewItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState(false);

  const { data: categoriesData } = useCategories();
  const categories = (categoriesData ?? []).filter((c: { isVirtual?: boolean }) => !c.isVirtual);

  const preview = useImportPreview();
  const confirm = useImportConfirm();

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setConfirmed(false);
    preview.mutate(Array.from(files), {
      onSuccess: (res) => {
        setItems(res.items);
        const validIdx = new Set(
          res.items.flatMap((it, i) => (it.valid ? [i] : []))
        );
        setSelected(validIdx);
      },
      onError: () => toast.error('Failed to parse files'),
    });
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

  const setCategoryForItem = (idx: number, categoryId: string) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, categoryId: categoryId ? Number(categoryId) : undefined } : it
      )
    );
  };

  const handleConfirm = () => {
    const toImport = items
      .filter((_, i) => selected.has(i))
      .map((it) => ({
        type: it.type,
        title: it.title,
        description: it.description,
        body: it.body,
        categoryId: it.categoryId,
        articleType: it.articleType,
        courseType: it.courseType,
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
      onError: () => toast.error('Import failed'),
    });
  };

  const validCount = items.filter((it) => it.valid).length;
  const selectedCount = selected.size;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Bulk Import</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload .md, .json, or .csv files to import articles and courses as drafts.
          </p>
        </div>

        {/* Drop zone */}
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
              <p className="text-sm font-medium">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .md &nbsp;·&nbsp; .json &nbsp;·&nbsp; .csv</p>
            </>
          )}
        </div>

        {/* Format guide */}
        {items.length === 0 && !preview.isPending && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
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

Body content here…`}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> JSON (.json)</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground font-mono whitespace-pre">
{`[
  {
    "type": "ARTICLE",
    "title": "My Article",
    "categorySlug": "backend",
    "description": "Short summary",
    "articleType": "standard",
    "body": "Body content…"
  }
]`}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> CSV (.csv)</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground font-mono whitespace-pre">
{`type,title,categorySlug,description,articleType,body
ARTICLE,My Article,backend,Summary,standard,Body…
COURSE,My Course,frontend,,STANDARD,`}
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
                    <TableHead>Title</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead className="w-44">Category</TableHead>
                    <TableHead className="w-24">File</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx} className={!item.valid ? 'opacity-60' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(idx)}
                          disabled={!item.valid}
                          onCheckedChange={() => toggleItem(idx)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{item.title || <span className="text-muted-foreground italic">untitled</span>}</div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">{item.description}</div>
                        )}
                        {item.error && (
                          <div className="text-xs text-destructive mt-0.5">{item.error}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{item.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.categoryId ? String(item.categoryId) : ''}
                          onValueChange={(val) => setCategoryForItem(idx, val)}
                          disabled={!item.valid}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder={item.categorySlug || 'Pick category'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {categories.map((cat: { id: number; name: string }) => (
                              <SelectItem key={cat.id} value={String(cat.id)}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
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
      </div>
    </DashboardLayout>
  );
}
