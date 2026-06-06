import { cn } from '@/lib/utils';
import { Category } from '@/types/content';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserGroup } from '@/types/content';
import { Settings, FolderTree, Calendar, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface CategoryDetailsPanelProps {
  category: Category;
  reviewerGroups: UserGroup[];
  onUpdateSettings: (settings: Category['settings']) => void;
  className?: string;
}

export function CategoryDetailsPanel({
  category,
  reviewerGroups,
  onUpdateSettings,
  className,
}: CategoryDetailsPanelProps) {
  const handleAutoApprovalChange = (checked: boolean) => {
    onUpdateSettings({
      ...category.settings,
      autoApproval: checked,
    });
  };

  const handleReviewerGroupChange = (groupId: string) => {
    onUpdateSettings({
      ...category.settings,
      defaultReviewerGroupId: groupId === 'none' ? null : groupId,
    });
  };

  const handleContentTypeToggle = (type: 'course' | 'article') => {
    const currentTypes = category.settings.allowedContentTypes;
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];
    
    onUpdateSettings({
      ...category.settings,
      allowedContentTypes: newTypes,
    });
  };

  const getCategoryPath = (cat: Category): string[] => {
    // This would normally traverse up the tree
    return [cat.name];
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <FolderTree className="w-4 h-4" />
          {getCategoryPath(category).map((name, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {name}
              {i < arr.length - 1 && <ChevronRight className="w-3 h-3" />}
            </span>
          ))}
        </div>
        <h2 className="text-2xl font-bold">{category.name}</h2>
        {category.description && (
          <p className="text-muted-foreground mt-1">{category.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Created {format(new Date(category.createdAt), 'PP')}
          </span>
          <span>
            Updated {format(new Date(category.updatedAt), 'PP')}
          </span>
        </div>
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Category Settings
          </CardTitle>
          <CardDescription>
            Configure how content is managed in this category.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Default Reviewer Group */}
          <div className="space-y-2">
            <Label>Default Reviewer Group</Label>
            <Select
              value={category.settings.defaultReviewerGroupId || 'none'}
              onValueChange={handleReviewerGroupChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reviewer group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default reviewer</SelectItem>
                {reviewerGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Content submitted in this category will be assigned to this group for review.
            </p>
          </div>

          {/* Allowed Content Types */}
          <div className="space-y-2">
            <Label>Allowed Content Types</Label>
            <div className="flex gap-2">
              <Button
                variant={category.settings.allowedContentTypes.includes('course') ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleContentTypeToggle('course')}
              >
                Courses
              </Button>
              <Button
                variant={category.settings.allowedContentTypes.includes('article') ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleContentTypeToggle('article')}
              >
                Articles
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only selected content types can be created in this category.
            </p>
          </div>

          {/* Auto Approval */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Approval</Label>
              <p className="text-xs text-muted-foreground">
                Automatically approve content without manual review.
              </p>
            </div>
            <Switch
              checked={category.settings.autoApproval}
              onCheckedChange={handleAutoApprovalChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{category.children.length}</div>
            <p className="text-sm text-muted-foreground">Subcategories</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{category.userGroups.length}</div>
            <p className="text-sm text-muted-foreground">Assigned Groups</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {category.settings.allowedContentTypes.length}
            </div>
            <p className="text-sm text-muted-foreground">Content Types</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
