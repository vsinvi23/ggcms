import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OverflowFilterGroupProps {
  label: string;
  items: string[];
  selectedItems: string[];
  onToggleItem: (item: string) => void;
  onRemoveItem: (item: string) => void;
  maxInlineCount?: number;
}

export function OverflowFilterGroup({
  label,
  items,
  selectedItems,
  onToggleItem,
  onRemoveItem,
  maxInlineCount = 8,
}: OverflowFilterGroupProps) {
  const [selectValue, setSelectValue] = useState<string>('');

  const inlineItems = items.slice(0, maxInlineCount);
  const overflowItems = items.slice(maxInlineCount);

  const handleSelectOverflow = (val: string) => {
    if (val && !selectedItems.includes(val)) {
      onToggleItem(val);
    }
    setSelectValue('');
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border/50">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
          {label}
        </label>
        {selectedItems.length > 0 && (
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            {selectedItems.length} selected
          </span>
        )}
      </div>

      {/* Selected Active Tags */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {selectedItems.map((selected) => (
            <Badge
              key={selected}
              variant="default"
              className="text-[11px] font-semibold bg-primary text-primary-foreground flex items-center gap-1 px-2 py-0.5 rounded-lg"
            >
              <span>{selected}</span>
              <button
                type="button"
                onClick={() => onRemoveItem(selected)}
                className="hover:opacity-80 transition-opacity ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Inline Filter Chips (Max 3-line visual budget / maxInlineCount) */}
      <div className="flex flex-wrap gap-1.5">
        {inlineItems.map((item) => {
          const isSelected = selectedItems.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggleItem(item)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                  : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border'
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>

      {/* Overflow Dropdown Picker if items exceed threshold */}
      {overflowItems.length > 0 && (
        <div className="pt-1">
          <Select value={selectValue} onValueChange={handleSelectOverflow}>
            <SelectTrigger className="w-full h-8 text-xs bg-background border-border rounded-xl">
              <SelectValue placeholder={`+ Select from ${overflowItems.length} more ${label.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {overflowItems.map((item) => (
                <SelectItem key={item} value={item} className="text-xs">
                  {item} {selectedItems.includes(item) ? '✓' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
