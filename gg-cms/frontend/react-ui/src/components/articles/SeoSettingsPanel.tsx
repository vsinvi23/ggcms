import { cn } from '@/lib/utils';
import { SeoSettings } from '@/types/content';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';

interface SeoSettingsPanelProps {
  seo: SeoSettings;
  onChange: (seo: SeoSettings) => void;
  className?: string;
}

export function SeoSettingsPanel({
  seo,
  onChange,
  className,
}: SeoSettingsPanelProps) {
  const [newKeyword, setNewKeyword] = useState('');

  const handleChange = <K extends keyof SeoSettings>(key: K, value: SeoSettings[K]) => {
    onChange({ ...seo, [key]: value });
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !seo.keywords.includes(newKeyword.trim())) {
      handleChange('keywords', [...seo.keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    handleChange('keywords', seo.keywords.filter((k) => k !== keyword));
  };

  // SEO Score calculations
  const titleLength = seo.metaTitle.length;
  const descriptionLength = seo.metaDescription.length;
  
  const titleScore = titleLength >= 30 && titleLength <= 60 ? 100 : titleLength > 0 ? 50 : 0;
  const descScore = descriptionLength >= 120 && descriptionLength <= 160 ? 100 : descriptionLength > 0 ? 50 : 0;
  const keywordScore = seo.keywords.length >= 3 ? 100 : seo.keywords.length > 0 ? 50 : 0;
  
  const overallScore = Math.round((titleScore + descScore + keywordScore) / 3);

  return (
    <div className={cn('space-y-6', className)}>
      {/* SEO Score Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">SEO Score</CardTitle>
            <span className={cn(
              'text-2xl font-bold',
              overallScore >= 80 ? 'text-success' : overallScore >= 50 ? 'text-warning' : 'text-destructive'
            )}>
              {overallScore}%
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={overallScore} className="h-2" />
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {titleScore === 100 ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : (
                <AlertCircle className="w-4 h-4 text-warning" />
              )}
              <span>
                Title: {titleLength}/60 characters
                {titleLength < 30 && ' (too short)'}
                {titleLength > 60 && ' (too long)'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {descScore === 100 ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : (
                <AlertCircle className="w-4 h-4 text-warning" />
              )}
              <span>
                Description: {descriptionLength}/160 characters
                {descriptionLength < 120 && ' (too short)'}
                {descriptionLength > 160 && ' (too long)'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {keywordScore === 100 ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : (
                <AlertCircle className="w-4 h-4 text-warning" />
              )}
              <span>
                Keywords: {seo.keywords.length} added
                {seo.keywords.length < 3 && ' (add more)'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meta Title */}
      <div className="space-y-2">
        <Label htmlFor="metaTitle">Meta Title</Label>
        <Input
          id="metaTitle"
          value={seo.metaTitle}
          onChange={(e) => handleChange('metaTitle', e.target.value)}
          placeholder="Page title for search engines"
          maxLength={70}
        />
        <p className="text-xs text-muted-foreground">
          Recommended: 30-60 characters. Currently: {titleLength}
        </p>
      </div>

      {/* Meta Description */}
      <div className="space-y-2">
        <Label htmlFor="metaDescription">Meta Description</Label>
        <Textarea
          id="metaDescription"
          value={seo.metaDescription}
          onChange={(e) => handleChange('metaDescription', e.target.value)}
          placeholder="Brief description for search engine results"
          rows={3}
          maxLength={170}
        />
        <p className="text-xs text-muted-foreground">
          Recommended: 120-160 characters. Currently: {descriptionLength}
        </p>
      </div>

      {/* Keywords */}
      <div className="space-y-2">
        <Label>Keywords</Label>
        <div className="flex gap-2">
          <Input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="Add a keyword"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
          />
          <Button type="button" variant="secondary" onClick={handleAddKeyword}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {seo.keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="gap-1">
              {keyword}
              <button
                onClick={() => handleRemoveKeyword(keyword)}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Canonical URL */}
      <div className="space-y-2">
        <Label htmlFor="canonicalUrl">Canonical URL (Optional)</Label>
        <Input
          id="canonicalUrl"
          value={seo.canonicalUrl || ''}
          onChange={(e) => handleChange('canonicalUrl', e.target.value)}
          placeholder="https://example.com/original-article"
        />
        <p className="text-xs text-muted-foreground">
          Use this to specify the preferred URL if this content appears at multiple URLs.
        </p>
      </div>

      {/* OG Image */}
      <div className="space-y-2">
        <Label htmlFor="ogImage">Open Graph Image URL (Optional)</Label>
        <Input
          id="ogImage"
          value={seo.ogImage || ''}
          onChange={(e) => handleChange('ogImage', e.target.value)}
          placeholder="https://example.com/image.jpg"
        />
        <p className="text-xs text-muted-foreground">
          Image displayed when sharing on social media. Recommended size: 1200x630px.
        </p>
      </div>
    </div>
  );
}
