export interface ClientErrorLog {
  id: string;
  timestamp: string;
  url: string;
  userAgent: string;
  message: string;
  stack?: string;
  componentStack?: string;
}

const STORAGE_KEY = 'gg_client_error_logs';
const MAX_LOGS = 100;

export function getClientErrorLogs(): ClientErrorLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read client error logs:', err);
    return [];
  }
}

export function logClientError(error: Error | string, componentStack?: string): ClientErrorLog {
  const message = typeof error === 'string' ? error : error.message || String(error);
  const stack = typeof error === 'string' ? undefined : error.stack;

  const entry: ClientErrorLog = {
    id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    message,
    stack,
    componentStack,
  };

  try {
    const existing = getClientErrorLogs();
    const updated = [entry, ...existing].slice(0, MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to persist client error log:', err);
  }

  return entry;
}

export function clearClientErrorLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear error logs:', err);
  }
}

export function downloadErrorLogsJson(): void {
  const logs = getClientErrorLogs();
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `gg-cms-error-logs-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function downloadErrorLogsCsv(): void {
  const logs = getClientErrorLogs();
  const headers = ['Timestamp', 'URL', 'Message', 'Stack', 'Component Stack'];
  const rows = logs.map((log) => [
    `"${log.timestamp}"`,
    `"${log.url.replace(/"/g, '""')}"`,
    `"${log.message.replace(/"/g, '""')}"`,
    `"${(log.stack || '').replace(/"/g, '""')}"`,
    `"${(log.componentStack || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `gg-cms-error-logs-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
