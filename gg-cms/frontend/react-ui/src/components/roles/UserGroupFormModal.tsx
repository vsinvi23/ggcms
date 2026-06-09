import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserGroup, Category } from '@/types/content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, FolderTree, Shield } from 'lucide-react';

export interface RoleOption {
  id: string;
  name: string;
  color: string;
}

const userGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  roleId: z.string().min(1, 'Role is required'),
  assignToCategories: z.boolean().default(false),
  selectedCategories: z.array(z.string()).default([]),
});

type UserGroupFormData = z.infer<typeof userGroupSchema>;

interface UserGroupFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: UserGroupFormData) => void;
  group?: (UserGroup & { roleId?: string }) | null;
  categories: Category[];
  roles?: RoleOption[];
  isLoading?: boolean;
}

// Flatten categories for selection
const flattenCategoriesWithPath = (
  categories: Category[],
  parentPath: string[] = []
): { id: string; name: string; path: string[] }[] => {
  const result: { id: string; name: string; path: string[] }[] = [];
  categories.forEach((cat) => {
    const currentPath = [...parentPath, cat.name];
    result.push({ id: cat.id, name: cat.name, path: currentPath });
    if (cat.children.length > 0) {
      result.push(...flattenCategoriesWithPath(cat.children, currentPath));
    }
  });
  return result;
};

export function UserGroupFormModal({
  open,
  onClose,
  onSubmit,
  group,
  categories,
  roles = [],
  isLoading = false,
}: UserGroupFormModalProps) {
  const isEditing = !!group;
  const flatCategories = flattenCategoriesWithPath(categories);

  const form = useForm<UserGroupFormData>({
    resolver: zodResolver(userGroupSchema),
    defaultValues: {
      name: '',
      description: '',
      roleId: 'viewer',
      assignToCategories: false,
      selectedCategories: [],
    },
  });

  useEffect(() => {
    if (open) {
      if (group) {
        form.reset({
          name: group.name || '',
          description: group.description || '',
          roleId: group.roleId || 'viewer',
          assignToCategories: false,
          selectedCategories: [],
        });
      } else {
        form.reset({
          name: '',
          description: '',
          roleId: roles.length > 0 ? roles[roles.length - 1].id : 'viewer',
          assignToCategories: false,
          selectedCategories: [],
        });
      }
    }
  }, [open, group, form, roles]);

  const assignToCategories = form.watch('assignToCategories');
  const selectedCategories = form.watch('selectedCategories');

  const handleSubmit = (data: UserGroupFormData) => {
    onSubmit(data);
    form.reset();
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      handleClose();
    }
  };

  const toggleCategory = (categoryId: string) => {
    const current = form.getValues('selectedCategories');
    if (current.includes(categoryId)) {
      form.setValue('selectedCategories', current.filter((id) => id !== categoryId));
    } else {
      form.setValue('selectedCategories', [...current, categoryId]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit User Group' : 'Create User Group'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the user group details.'
              : 'Create a new user group and assign it to a role.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Content Reviewers" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this group's purpose"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Associated Role
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${role.color}`} />
                            {role.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Members of this group will inherit permissions from the selected role
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assignToCategories"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Assign to Categories</FormLabel>
                    <FormDescription>
                      Assign this group to specific categories or subcategories
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {assignToCategories && (
              <div className="border rounded-lg p-4 space-y-3">
                <Label className="flex items-center gap-2">
                  <FolderTree className="w-4 h-4" />
                  Select Categories
                </Label>
                <ScrollArea className="h-48 border rounded-md p-2">
                  <div className="space-y-1">
                    {flatCategories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted cursor-pointer"
                        onClick={() => toggleCategory(cat.id)}
                      >
                        <Checkbox
                          checked={selectedCategories.includes(cat.id)}
                          onCheckedChange={() => toggleCategory(cat.id)}
                        />
                        <div className="flex items-center gap-1 text-sm">
                          {cat.path.map((segment, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                              <span className={i === cat.path.length - 1 ? 'font-medium' : 'text-muted-foreground'}>
                                {segment}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedCategories.length} categor{selectedCategories.length === 1 ? 'y' : 'ies'}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : isEditing ? 'Update' : 'Create Group'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
