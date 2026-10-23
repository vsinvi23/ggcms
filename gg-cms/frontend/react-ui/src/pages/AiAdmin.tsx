import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useReindex } from '@/api/hooks/useAi';
import { AiErrorNotice } from '@/components/ai/AiShared';
import { AiSettingsPanel } from '@/components/ai/AiSettingsPanel';
import { AiUsagePanel } from '@/components/ai/AiUsagePanel';
import { AiModerationPanel } from '@/components/ai/AiModerationPanel';

function ReindexSection() {
  const [open, setOpen] = useState(false);
  const reindex = useReindex();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Rebuild the tutor search index from published articles and courses. The index also refreshes automatically every 5 minutes.</p>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={reindex.isPending}>Reindex tutor content</Button>
      <div role="status">
        {reindex.isSuccess && <p className="text-sm">Reindex complete. {reindex.data} items updated.</p>}
      </div>
      {reindex.isError && <AiErrorNotice error={reindex.error} />}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reindex tutor content?</AlertDialogTitle>
            <AlertDialogDescription>This re-reads all published content and may take a moment.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reindex.mutate()}>Reindex</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AiAdmin() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <h1 className="text-2xl font-bold">AI</h1>
        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="moderation">Moderation queue</TabsTrigger>
            <TabsTrigger value="index">Tutor index</TabsTrigger>
          </TabsList>
          <TabsContent value="settings"><AiSettingsPanel /></TabsContent>
          <TabsContent value="usage"><AiUsagePanel /></TabsContent>
          <TabsContent value="moderation"><AiModerationPanel /></TabsContent>
          <TabsContent value="index"><ReindexSection /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
