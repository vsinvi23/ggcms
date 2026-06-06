import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon, Clock, Globe, AlertCircle } from 'lucide-react';
import { format, addDays, setHours, setMinutes } from 'date-fns';

interface PublishSchedulerProps {
  scheduledDate?: string;
  onChange: (date: string | undefined) => void;
  className?: string;
}

export function PublishScheduler({
  scheduledDate,
  onChange,
  className,
}: PublishSchedulerProps) {
  const [isScheduled, setIsScheduled] = useState(!!scheduledDate);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    scheduledDate ? new Date(scheduledDate) : undefined
  );
  const [selectedHour, setSelectedHour] = useState(
    scheduledDate ? new Date(scheduledDate).getHours().toString().padStart(2, '0') : '09'
  );
  const [selectedMinute, setSelectedMinute] = useState(
    scheduledDate ? new Date(scheduledDate).getMinutes().toString().padStart(2, '0') : '00'
  );

  const handleScheduleToggle = (checked: boolean) => {
    setIsScheduled(checked);
    if (!checked) {
      onChange(undefined);
      setSelectedDate(undefined);
    } else if (selectedDate) {
      updateScheduledDate(selectedDate, selectedHour, selectedMinute);
    }
  };

  const updateScheduledDate = (date: Date, hour: string, minute: string) => {
    const scheduled = setMinutes(setHours(date, parseInt(hour)), parseInt(minute));
    onChange(scheduled.toISOString());
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      updateScheduledDate(date, selectedHour, selectedMinute);
    }
  };

  const handleTimeChange = (type: 'hour' | 'minute', value: string) => {
    if (type === 'hour') {
      setSelectedHour(value);
    } else {
      setSelectedMinute(value);
    }
    if (selectedDate) {
      updateScheduledDate(
        selectedDate,
        type === 'hour' ? value : selectedHour,
        type === 'minute' ? value : selectedMinute
      );
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  const presetDates = [
    { label: 'Tomorrow', date: addDays(new Date(), 1) },
    { label: 'In 3 days', date: addDays(new Date(), 3) },
    { label: 'In 1 week', date: addDays(new Date(), 7) },
    { label: 'In 2 weeks', date: addDays(new Date(), 14) },
  ];

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Schedule Publication</CardTitle>
              <CardDescription>
                Set a future date and time to automatically publish this content.
              </CardDescription>
            </div>
            <Switch checked={isScheduled} onCheckedChange={handleScheduleToggle} />
          </div>
        </CardHeader>

        {isScheduled && (
          <CardContent className="space-y-4">
            {/* Quick Presets */}
            <div className="space-y-2">
              <Label>Quick Select</Label>
              <div className="flex flex-wrap gap-2">
                {presetDates.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    onClick={() => handleDateSelect(preset.date)}
                    className={cn(
                      selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(preset.date, 'yyyy-MM-dd')
                        ? 'border-primary bg-primary/10'
                        : ''
                    )}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Date Picker */}
            <div className="space-y-2">
              <Label>Publication Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !selectedDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time Picker */}
            <div className="space-y-2">
              <Label>Publication Time</Label>
              <div className="flex gap-2">
                <Select value={selectedHour} onValueChange={(v) => handleTimeChange('hour', v)}>
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="Hour" />
                  </SelectTrigger>
                  <SelectContent>
                    {hours.map((hour) => (
                      <SelectItem key={hour} value={hour}>
                        {hour}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="flex items-center text-lg">:</span>
                <Select value={selectedMinute} onValueChange={(v) => handleTimeChange('minute', v)}>
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="Min" />
                  </SelectTrigger>
                  <SelectContent>
                    {minutes.map((min) => (
                      <SelectItem key={min} value={min}>
                        {min}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="flex items-center text-sm text-muted-foreground ml-2">
                  <Clock className="w-4 h-4 mr-1" />
                  Local time
                </span>
              </div>
            </div>

            {/* Summary */}
            {selectedDate && (
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="w-4 h-4 text-primary" />
                  Scheduled Publication
                </div>
                <p className="text-sm text-muted-foreground">
                  This content will be automatically published on{' '}
                  <span className="font-medium text-foreground">
                    {format(selectedDate, 'PPPP')}
                  </span>{' '}
                  at{' '}
                  <span className="font-medium text-foreground">
                    {selectedHour}:{selectedMinute}
                  </span>{' '}
                  local time.
                </p>
              </div>
            )}

            {!selectedDate && (
              <div className="rounded-lg bg-warning/10 p-4 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Please select a date to schedule publication.
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
