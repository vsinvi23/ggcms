import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Attachment } from '@/types/content';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  File,
  Image,
  Video,
  FileText,
  X,
  Download,
  Loader2,
} from 'lucide-react';

interface AttachmentUploaderProps {
  attachments: Attachment[];
  onUpload: (files: File[]) => void;
  onRemove: (attachmentId: string) => void;
  maxFiles?: number;
  maxSize?: number; // in bytes
  acceptedTypes?: string[];
  className?: string;
}

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Video;
  if (type.includes('pdf') || type.includes('document')) return FileText;
  return File;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function AttachmentUploader({
  attachments,
  onUpload,
  onRemove,
  maxFiles = 10,
  maxSize = 10 * 1024 * 1024, // 10MB
  acceptedTypes = ['image/*', 'application/pdf', '.doc', '.docx', '.xls', '.xlsx'],
  className,
}: AttachmentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<Record<string, number>>({});

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFiles = (files: File[]) => {
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        console.warn(`File ${file.name} exceeds max size`);
        return false;
      }
      return true;
    }).slice(0, maxFiles - attachments.length);

    if (validFiles.length > 0) {
      // Simulate upload progress
      validFiles.forEach(file => {
        setUploading(prev => ({ ...prev, [file.name]: 0 }));
        const interval = setInterval(() => {
          setUploading(prev => {
            const current = prev[file.name] || 0;
            if (current >= 100) {
              clearInterval(interval);
              const { [file.name]: _, ...rest } = prev;
              return rest;
            }
            return { ...prev, [file.name]: current + 20 };
          });
        }, 200);
      });

      onUpload(validFiles);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const canUploadMore = attachments.length < maxFiles;

  return (
    <div className={cn('space-y-4', className)}>
      {canUploadMore && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
          )}
        >
          <input
            type="file"
            multiple
            accept={acceptedTypes.join(',')}
            onChange={handleInputChange}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              Drop files here or click to upload
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Max {maxFiles} files, up to {formatFileSize(maxSize)} each
            </p>
          </label>
        </div>
      )}

      {/* Uploading files */}
      {Object.entries(uploading).map(([name, progress]) => (
        <div key={name} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{name}</p>
            <Progress value={progress} className="h-1 mt-1" />
          </div>
        </div>
      ))}

      {/* Attached files */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Attached files ({attachments.length})
          </p>
          <div className="space-y-2">
            {attachments.map((attachment) => {
              const Icon = getFileIcon(attachment.type);
              return (
                <div
                  key={attachment.id}
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg group"
                >
                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{attachment.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.size)}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => window.open(attachment.url, '_blank')}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onRemove(attachment.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
