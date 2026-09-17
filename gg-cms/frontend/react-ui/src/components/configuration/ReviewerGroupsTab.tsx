import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, X, ChevronDown, ChevronRight, Users, ShieldCheck, FolderTree, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/errors';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCategories,
  useCategoryReviewerGroups,
  useAddCategoryReviewerGroup,
  useRemoveCategoryReviewerGroup,
  useUpdateCategory,
} from '@/api/hooks/useCategories';
import { useGroupsQuery } from '@/api/hooks/useGroups';
import { CategoryResponseDto, GroupResponseDto } from '@/api/types';
import { cn } from '@/lib/utils';

// ─── Group-Centric Row Component ───────────────────────────────────────────────────

function ReviewerGroupRow({ group, categories }: { group: GroupResponseDto; categories: CategoryResponseDto[] }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const addGroup = useAddCategoryReviewerGroup();
  const removeGroup = useRemoveCategoryReviewerGroup();

  // Find categories assigned to this group
  // (We check which categories have this group linked)
  const handleAssignCategory = () => {
    if (!selectedCategoryId) return;
    addGroup.mutate(
      { categoryId: Number(selectedCategoryId), groupId: group.id },
      {
        onSuccess: () => {
          setSelectedCategoryId('');
          toast.success(`Category assigned to ${group.name}`);
        },
        onError: (err) => toast.error(toUserMessage(err, 'Failed to assign category')),
      }
    );
  };

  const handleRemoveCategory = (catId: number, catName: string) => {
    removeGroup.mutate(
      { categoryId: catId, groupId: group.id },
      {
        onSuccess: () => toast.success(`Unassigned "${catName}" from ${group.name}`),
        onError: (err) => toast.error(toUserMessage(err, 'Failed to unassign category')),
      }
    );
  };

  return (
    <div className="border border-border/80 rounded-2xl bg-card hover:border-emerald-500/30 transition-all overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              {group.name}
              {group.roles && group.roles.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-semibold border-emerald-500/30 text-emerald-600">
                  {group.roles.length} roles
                </Badge>
              )}
            </h4>
            <p className="text-xs text-muted-foreground line-clamp-1">{group.description || 'Reviewer team governance group'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!expanded && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Click to view assignments &amp; members
            </span>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border/50 bg-muted/20">
          <div className="space-y-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Assign New Category</span>
            <div className="flex items-center gap-2">
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger className="flex-1 h-9 text-xs rounded-xl">
                  <SelectValue placeholder="Select category to assign..." />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50 rounded-xl">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-9 rounded-xl gap-1.5"
                onClick={handleAssignCategory}
                disabled={!selectedCategoryId || addGroup.isPending}
              >
                {addGroup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Assign
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category-Centric Row Component ────────────────────────────────────────────────

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
        onError: (err) => toast.error(toUserMessage(err, 'Failed to link group')),
      }
    );
  };

  const handleRemove = (groupId: number, groupName: string) => {
    removeGroup.mutate(
      { categoryId: category.id, groupId },
      {
        onSuccess: () => toast.success(`Removed "${groupName}"`),
        onError: (err) => toast.error(toUserMessage(err, 'Failed to remove group')),
      }
    );
  };

  const handleSaveApprovals = () => {
    const n = Math.max(1, requiredApprovals);
    updateCategory.mutate(
      { id: category.id, data: { name: category.name, requiredApprovals: n } },
      {
        onSuccess: () => toast.success('Required approvals updated'),
        onError: (err) => toast.error(toUserMessage(err, 'Failed to update required approvals')),
      }
    );
  };

  return (
    <div className="border border-border/80 rounded-2xl bg-card hover:border-emerald-500/30 transition-all overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <FolderTree className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">{category.name}</span>
        </div>
        <div className="flex items-center gap-3">
          {!expanded && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Click to manage reviewer groups
            </span>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border/50 bg-muted/20">
          {groupsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Linked groups */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Assigned Reviewer Groups</span>
                <div className="flex flex-wrap gap-2">
                  {linkedGroups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No reviewer groups assigned yet.</p>
                  ) : (
                    linkedGroups.map((g) => (
                      <Badge key={g.id} variant="secondary" className="gap-1.5 py-1 px-2.5 rounded-lg border border-border">
                        <Users className="w-3 h-3 text-emerald-500" />
                        {g.name}
                        <button
                          type="button"
                          className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                          onClick={() => handleRemove(g.id, g.name)}
                          disabled={removeGroup.isPending}
                          aria-label={`Remove ${g.name}`}
                        >
                          <X className="w-3 h-3 text-destructive" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              {/* Required approvals */}
              <div className="flex items-center gap-3 pt-2 border-t border-border/40">
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Required Approvals Threshold:</span>
                <Input
                  type="number"
                  min={1}
                  value={requiredApprovals}
                  onChange={(e) => setRequiredApprovals(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="h-8 w-20 text-xs rounded-xl"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs rounded-xl"
                  onClick={handleSaveApprovals}
                  disabled={updateCategory.isPending}
                >
                  {updateCategory.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                </Button>
              </div>

              {/* Add group */}
              {availableGroups.length > 0 && (
                <div className="flex items-center gap-2 pt-2">
                  <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                    <SelectTrigger className="flex-1 h-9 text-xs rounded-xl">
                      <SelectValue placeholder="Select group to add..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50 rounded-xl">
                      {availableGroups.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-9 rounded-xl gap-1.5"
                    onClick={handleAdd}
                    disabled={!selectedGroupId || addGroup.isPending}
                  >
                    {addGroup.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Add Group
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

// ─── ReviewerGroupsTab Component ────────────────────────────────────────────────────

export function ReviewerGroupsTab() {
  const [viewPerspective, setViewPerspective] = useState<'category' | 'group'>('group');
  const { data: categories = [], isLoading: loadingCats } = useCategories();
  const { data: groupsData, isLoading: loadingGroups } = useGroupsQuery({ page: 0, size: 200 });

  const groups = groupsData?.items ?? [];

  // Flatten categories
  const flatten = (cats: CategoryResponseDto[]): CategoryResponseDto[] =>
    cats.flatMap((c) => [c, ...flatten(c.children ?? [])]);

  const flatCategories = flatten(categories).filter((c) => !c.isVirtual);
  const isLoading = loadingCats || loadingGroups;

  return (
    <Card className="rounded-2xl border-border">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              Reviewer Governance &amp; Assignments
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Assign reviewer groups to categories and configure minimum approval thresholds before content goes live.
            </CardDescription>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border shrink-0">
            <Button
              variant={viewPerspective === 'group' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewPerspective('group')}
              className={cn(
                'gap-1.5 text-xs font-semibold h-8 rounded-lg',
                viewPerspective === 'group' ? 'shadow-xs' : 'text-muted-foreground',
              )}
            >
              <Users className="w-3.5 h-3.5" /> Group-Centric
            </Button>
            <Button
              variant={viewPerspective === 'category' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewPerspective('category')}
              className={cn(
                'gap-1.5 text-xs font-semibold h-8 rounded-lg',
                viewPerspective === 'category' ? 'shadow-xs' : 'text-muted-foreground',
              )}
            >
              <FolderTree className="w-3.5 h-3.5" /> Category-Centric
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : viewPerspective === 'group' ? (
          /* Group-Centric Perspective */
          groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No reviewer groups found.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <ReviewerGroupRow key={group.id} group={group} categories={flatCategories} />
              ))}
            </div>
          )
        ) : (
          /* Category-Centric Perspective */
          flatCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No categories found.</p>
          ) : (
            <div className="space-y-3">
              {flatCategories.map((cat) => (
                <CategoryReviewerRow key={cat.id} category={cat} />
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

