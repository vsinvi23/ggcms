import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Calendar,
  User,
  Clock,
  Tag,
  FileText,
  Video,
  Image,
  ExternalLink,
  X,
} from 'lucide-react';
import { Article, Course, Attachment } from '@/types/content';
import { cn } from '@/lib/utils';

interface ContentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'article' | 'course';
  content: Article | Course | null;
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function ContentPreviewModal({
  open,
  onOpenChange,
  type,
  content,
}: ContentPreviewModalProps) {
  if (!content) return null;

  const isArticle = type === 'article';
  const article = isArticle ? (content as Article) : null;
  const course = !isArticle ? (content as Course) : null;

  const attachments = article?.attachments || [];
  const imageAttachments = attachments.filter((a) => a.type.startsWith('image/'));
  const videoAttachments = attachments.filter((a) => a.type.startsWith('video/'));
  const docAttachments = attachments.filter(
    (a) => !a.type.startsWith('image/') && !a.type.startsWith('video/')
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-start justify-between">
            <div className="space-y-1 pr-8">
              <Badge variant="outline" className="mb-2">
                {type === 'article' ? 'Article' : 'Course'} Preview
              </Badge>
              <DialogTitle className="text-2xl font-bold leading-tight">
                {content.title}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="px-6 pb-6 space-y-6">
            {/* Featured Image / Thumbnail */}
            {(article?.featuredImage || course?.thumbnail) && (
              <div className="relative aspect-video bg-muted rounded-xl overflow-hidden">
                <img
                  src={article?.featuredImage || course?.thumbnail}
                  alt={content.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <Badge
                    variant={content.status === 'published' ? 'default' : 'secondary'}
                    className="capitalize"
                  >
                    {content.status}
                  </Badge>
                </div>
              </div>
            )}

            {/* Meta Information */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="w-4 h-4" />
                <span>{article?.author || course?.instructor}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(content.createdAt)}</span>
              </div>
              {course && (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{course.duration} min</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Tag className="w-4 h-4" />
                    <span>{course.language}</span>
                  </div>
                </>
              )}
            </div>

            {/* Tags */}
            {content.tags && content.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {content.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <Separator />

            {/* Description / Excerpt */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">
                {isArticle ? 'Excerpt' : 'Description'}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {article?.excerpt || course?.description || 'No description available.'}
              </p>
            </div>

            {/* Article Content Blocks Preview */}
            {article?.contentBlocks && article.contentBlocks.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Content Preview</h3>
                  <div className="space-y-4">
                    {article.contentBlocks.slice(0, 3).map((block, index) => (
                      <div
                        key={block.id || index}
                        className={cn(
                          block.type !== 'code' && 'p-4 rounded-lg border',
                          block.type === 'paragraph' && 'bg-card'
                        )}
                      >
                        {(block.type === 'heading1' || block.type === 'heading2' || block.type === 'heading3') && (
                          <h4 className="font-bold text-lg">{block.content}</h4>
                        )}
                        {block.type === 'paragraph' && (
                          <p className="text-muted-foreground">{block.content}</p>
                        )}
                        {block.type === 'code' && (
                          <div className="overflow-hidden rounded-lg border">
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-muted border-b font-mono text-xs">
                              <span className="font-bold uppercase tracking-wide" style={{ fontSize: '0.72rem' }}>
                                {block.codeData?.language || 'plaintext'}
                              </span>
                              {block.codeData?.filename && (
                                <span className="text-muted-foreground italic">{block.codeData.filename}</span>
                              )}
                            </div>
                            <pre className="overflow-x-auto m-0 rounded-none bg-muted/50 p-4 font-mono text-sm">
                              <code>{block.codeData?.code || block.content}</code>
                            </pre>
                          </div>
                        )}
                        {block.type === 'image' && block.imageUrl && (
                          <img
                            src={block.imageUrl}
                            alt={block.imageAlt || 'Content'}
                            className="rounded-lg max-h-48 object-cover"
                          />
                        )}
                      </div>
                    ))}
                    {article.contentBlocks.length > 3 && (
                      <p className="text-sm text-muted-foreground text-center">
                        + {article.contentBlocks.length - 3} more content blocks
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Course Sections Preview */}
            {course?.sections && course.sections.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Course Curriculum</h3>
                  <div className="space-y-3">
                    {course.sections.map((section, index) => (
                      <div
                        key={section.id || index}
                        className="p-4 rounded-lg border bg-card"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{section.title}</h4>
                          <Badge variant="outline">
                            {section.subsections?.length || 0} subsections
                          </Badge>
                        </div>
                        {section.subsections && section.subsections.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {section.subsections.slice(0, 3).map((subsection, idx) => (
                              <li
                                key={subsection.id || idx}
                                className="text-sm text-muted-foreground flex items-center gap-2"
                              >
                                <Video className="w-3 h-3" />
                                {subsection.title} ({subsection.lessons?.length || 0} lessons)
                              </li>
                            ))}
                            {section.subsections.length > 3 && (
                              <li className="text-sm text-muted-foreground">
                                + {section.subsections.length - 3} more subsections
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Attachments</h3>

                  {/* Images */}
                  {imageAttachments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Images ({imageAttachments.length})
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {imageAttachments.slice(0, 4).map((img) => (
                          <div
                            key={img.id}
                            className="aspect-square rounded-lg bg-muted overflow-hidden"
                          >
                            <img
                              src={img.url}
                              alt={img.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Videos */}
                  {videoAttachments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        Videos ({videoAttachments.length})
                      </p>
                      <div className="space-y-2">
                        {videoAttachments.map((video) => (
                          <div
                            key={video.id}
                            className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                          >
                            <Video className="w-4 h-4 text-primary" />
                            <span className="text-sm truncate flex-1">{video.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(video.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Documents */}
                  {docAttachments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Documents ({docAttachments.length})
                      </p>
                      <div className="space-y-2">
                        {docAttachments.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                          >
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm truncate flex-1">{doc.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(doc.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* SEO Preview (for articles) */}
            {article?.seo && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">SEO Preview</h3>
                  <div className="p-4 rounded-lg border bg-card space-y-2">
                    <p className="text-primary text-lg font-medium line-clamp-1">
                      {article.seo.metaTitle || article.title}
                    </p>
                    <p className="text-sm text-green-600 line-clamp-1">
                      yourdomain.com/{article.slug}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {article.seo.metaDescription || article.excerpt}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Close Preview
              </Button>
              <Button className="flex-1">
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Full Preview
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
