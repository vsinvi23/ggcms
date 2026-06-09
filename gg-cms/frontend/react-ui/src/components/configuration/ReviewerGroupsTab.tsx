import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, X, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories, useCategoryReviewerGroups, useAddCategoryReviewerGroup, useRemoveCategoryReviewerGroup } from '@/api/hooks/useCategories';
import { useUpdateCategory } from '@/api/hooks/useCategories';
import { useGroupsQuery } from '@/api/hooks/useGroups';
import { CategoryResponseDto } from '@/api/types';

function CategoryReviewerRow({ category }: { category: CategoryResponseDto }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [requiredApprovals, setRequiredApprovals] = useState(category.requiredApprovals ?? 1);

  const { data: linkedGroups = [], isLoading: groupsLoading } = useCategoryReviewerGroups(
    expanded ? category.id : null
  );
  const { data: allGroupsData } = useGroupsQuery({ page: 0, size: 200 });
  const allGroups = allGroupsData?.items ?? [];

  const addGroup = useAddCategoryReviewerGroup();
  const removeGroup = useRemoveCategoryReviewerGroup();
  const updateCategory = useUpdateCategory();

  const linkedGroupIds = new Set(linkedGroups.map((g) => g.id));
  const availableGroups = allGroups.filter((g) => !linkedGroupIds.has(g.id));

  const handleAdd = () => {
    if (!selectedGroupId) return;
    addGroup.mutate(
      { categoryId: category.id, groupId: Number(selectedGroupId) },
      {
        onSuccess: () => {
          setSelectedGroupId('');
          toast.success('Reviewer group linked');
        },
        onError: () => toast.error('Failed to link group'),
      }
    );
  };

  const handleRemove = (groupId: number, groupName: string) => {
    removeGroup.mutate(
      { categoryId: category.id, groupId },
      {
        onSuccess: () => toast.success(`Removed "${groupName}"`),
        onError: () => toast.error('Failed to remove group'),
      }
    );
  };

  const handleSaveApprovals = () => {
    const n = Math.max(1, requiredApprovals);
    updateCategory.mutate(
      { id: category.id, data: { name: category.name, requiredApprovals: n } },
      {
        onSuccess: () => toast.success('Required approvals updated'),
        onError: () => toast.error('Failed to update required approvals'),
      }
    );
  };

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {category.name}
        </div>
        {!expanded && (
          <span className="text-xs text-muted-foreground">
            Click to manage reviewer groups
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t">
          {groupsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Linked groups */}
              <div className="flex flex-wrap gap-2 pt-3">
                {linkedGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reviewer groups assigned yet.</p>
                ) : (
                  linkedGroups.map((g) => (
                    <Badge key={g.id} variant="secondary" className="gap-1 pr-1">
                      <Users className="w-3 h-3" />
                      {g.name}
                      <button
                        type="button"
                        className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                        onClick={() => handleRemove(g.id, g.name)}
                        disabled={removeGroup.isPending}
                        aria-label={`Remove ${g.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>

              {/* Required approvals */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Required approvals:</span>
                <Input
                  type="number"
                  min={1}
                  value={requiredApprovals}
                  onChange={(e) => setRequiredApprovals(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="h-7 w-16 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleSaveApprovals}
                  disabled={updateCategory.isPending}
                >
                  {updateCategory.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                </Button>
              </div>

              {/* Add group */}
              {availableGroups.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                    <SelectTrigger className="flex-1 h-8 text-sm">
                      <SelectValue placeholder="Select group to add..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableGroups.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={handleAdd}
                    disabled={!selectedGroupId || addGroup.isPending}
                  >
                    {addGroup.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Add
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ReviewerGroupsTab() {
  const { data: categories = [], isLoading } = useCategories();

  // Flatten tree to get all categories, excluding the virtual "geek" root
  // (it is auto-managed by bootstrap and should not appear in the UI).
  const flatten = (cats: CategoryResponseDto[]): CategoryResponseDto[] =>
    cats.flatMap((c) => [c, ...flatten(c.children ?? [])]);

  const flatCategories = flatten(categories).filter((c) => !c.isVirtual);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Category Reviewer Groups
        </CardTitle>
        <CardDescription>
          Assign reviewer groups to categories. When content is submitted for review, members of
          the assigned groups will see it in the review queue and can claim it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : flatCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No categories found. Create categories first.
          </p>
        ) : (
          <div className="space-y-2">
            {flatCategories.map((cat) => (
              <CategoryReviewerRow key={cat.id} category={cat} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
