import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getClientErrorLogs,
  clearClientErrorLogs,
  downloadErrorLogsJson,
  downloadErrorLogsCsv,
  ClientErrorLog,
} from '@/lib/errorLogStore';
import { AlertCircle, Download, Trash2, FileSpreadsheet, RefreshCw, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export function ErrorAuditLogsTab() {
  const [logs, setLogs] = useState<ClientErrorLog[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refreshLogs = () => {
    setLogs(getClientErrorLogs());
  };

  useEffect(() => {
    refreshLogs();
  }, []);

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear all client error audit logs?')) {
      clearClientErrorLogs();
      refreshLogs();
      toast.success('Error audit logs cleared');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Client &amp; Runtime Error Audit Logs
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Captured React runtime exceptions, unhandled client crashes, and stack traces logged locally and server-side.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshLogs} className="gap-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadErrorLogsJson}
              disabled={logs.length === 0}
              className="gap-1.5 text-xs"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              JSON Log
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadErrorLogsCsv}
              disabled={logs.length === 0}
              className="gap-1.5 text-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              CSV Log
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={logs.length === 0}
              className="gap-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Logs
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <AlertCircle className="w-10 h-10 mx-auto opacity-30 text-emerald-500" />
              <p className="font-semibold text-foreground">No Runtime Errors Recorded</p>
              <p className="text-xs">Client views are running cleanly with zero logged exceptions.</p>
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="w-44 text-xs font-semibold">Timestamp</TableHead>
                    <TableHead className="w-48 text-xs font-semibold">URL Path</TableHead>
                    <TableHead className="text-xs font-semibold">Error Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const isExpanded = expandedId === log.id;
                    const pathOnly = log.url ? new URL(log.url, 'http://localhost').pathname : '/';
                    return (
                      <tbody key={log.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        >
                          <TableCell className="p-2 text-center">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {new Date(log.timestamp).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs font-mono truncate max-w-[180px]" title={log.url}>
                            <Badge variant="outline" className="text-[10px] truncate">
                              {pathOnly}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-medium text-destructive truncate max-w-[320px]">
                            {log.message}
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={4} className="p-4 space-y-3">
                              <div className="text-xs font-semibold text-foreground">Full Error Details</div>
                              <div className="space-y-1">
                                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                  Message
                                </span>
                                <p className="text-xs font-mono bg-destructive/10 text-destructive p-2.5 rounded-lg border border-destructive/20">
                                  {log.message}
                                </p>
                              </div>

                              {log.stack && (
                                <div className="space-y-1">
                                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                    Stack Trace
                                  </span>
                                  <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-x-auto max-h-56 text-muted-foreground border border-border/60">
                                    {log.stack}
                                  </pre>
                                </div>
                              )}

                              {log.componentStack && (
                                <div className="space-y-1">
                                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                    React Component Stack
                                  </span>
                                  <pre className="text-[11px] font-mono bg-muted p-3 rounded-lg overflow-x-auto max-h-40 text-muted-foreground border border-border/60">
                                    {log.componentStack}
                                  </pre>
                                </div>
                              )}

                              <div className="text-[10px] text-muted-foreground pt-1 flex items-center justify-between">
                                <span>User Agent: {log.userAgent}</span>
                                <span>Full URL: {log.url}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </tbody>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
