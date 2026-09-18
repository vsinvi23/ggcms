import React, { useState } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, Layers, BookOpen, FileText, Compass, HelpCircle, Terminal, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

interface TechnologyEcosystem {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  coursesCount: number;
  articlesCount: number;
  cheatSheetsCount: number;
  interviewQuestionsCount: number;
  popularTopics: string[];
}

const mockTechnologies: TechnologyEcosystem[] = [
  {
    id: 't-1',
    slug: 'go',
    name: 'Go (Golang)',
    category: 'Language',
    description: 'Statistically typed, compiled programming language designed at Google for concurrent network services.',
    coursesCount: 12,
    articlesCount: 86,
    cheatSheetsCount: 9,
    interviewQuestionsCount: 72,
    popularTopics: ['Concurrency', 'HTTP', 'Interfaces', 'Generics', 'Testing', 'Pointers'],
  },
  {
    id: 't-2',
    slug: 'kubernetes',
    name: 'Kubernetes',
    category: 'DevOps / Cloud',
    description: 'Open-source container orchestration system for automating application deployment, scaling, and management.',
    coursesCount: 8,
    articlesCount: 64,
    cheatSheetsCount: 12,
    interviewQuestionsCount: 58,
    popularTopics: ['Networking', 'Ingress', 'Pods', 'Services', 'StatefulSets', 'RBAC'],
  },
  {
    id: 't-3',
    slug: 'oauth-2',
    name: 'OAuth 2.0 & OIDC',
    category: 'Security / Identity',
    description: 'Industry-standard authorization framework and identity layer for web and mobile security.',
    coursesCount: 5,
    articlesCount: 42,
    cheatSheetsCount: 6,
    interviewQuestionsCount: 35,
    popularTopics: ['PKCE', 'JWT', 'Authorization Code', 'Client Credentials', 'Scopes'],
  },
  {
    id: 't-4',
    slug: 'postgresql',
    name: 'PostgreSQL',
    category: 'Database',
    description: 'Advanced open-source relational database supporting ACID transactions, JSONB, and custom indexing.',
    coursesCount: 7,
    articlesCount: 51,
    cheatSheetsCount: 8,
    interviewQuestionsCount: 44,
    popularTopics: ['Indexing', 'EXPLAIN ANALYZE', 'ACID', 'JSONB', 'Replication'],
  },
];

export function TechnologiesPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = mockTechnologies.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.popularTopics.some(top => top.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-16">
        
        <div className="relative border-b border-border bg-gradient-to-b from-primary/5 via-transparent to-background pt-12 pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-4">
            <Badge variant="outline" className="px-3 py-1 text-xs font-semibold text-primary border-primary/30 rounded-full">
              Technology Ecosystem Directory
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              Technologies
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Explore the entire knowledge ecosystem, courses, cheat sheets, and interview questions for any technology.
            </p>

            <div className="max-w-xl mx-auto relative pt-4">
              <div className="relative">
                <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search technologies (e.g., Go, Kubernetes, PostgreSQL)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 pr-4 h-12 text-base rounded-2xl bg-card border-border shadow-sm focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map(tech => (
              <div
                key={tech.id}
                onClick={() => navigate(`/technology/${tech.slug}`)}
                className="bg-card border border-border hover:border-primary/50 rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all hover:shadow-lg cursor-pointer group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs font-bold">{tech.category}</Badge>
                    <span className="text-xs text-muted-foreground font-semibold">Ecosystem Overview</span>
                  </div>

                  <div>
                    <h3 className="text-2xl font-extrabold text-foreground group-hover:text-primary transition-colors">
                      {tech.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {tech.description}
                    </p>
                  </div>

                  {/* Resource Counts Grid */}
                  <div className="grid grid-cols-4 gap-2 pt-2 border-y border-border/60 py-3 text-center">
                    <div>
                      <span className="text-lg font-extrabold text-primary block">{tech.coursesCount}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Courses</span>
                    </div>
                    <div>
                      <span className="text-lg font-extrabold text-foreground block">{tech.articlesCount}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Articles</span>
                    </div>
                    <div>
                      <span className="text-lg font-extrabold text-amber-500 block">{tech.cheatSheetsCount}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Cheats</span>
                    </div>
                    <div>
                      <span className="text-lg font-extrabold text-rose-500 block">{tech.interviewQuestionsCount}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Interview Qs</span>
                    </div>
                  </div>

                  {/* Popular Topics */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Popular Topics:</span>
                    <div className="flex flex-wrap gap-1">
                      {tech.popularTopics.map(top => (
                        <span key={top} className="text-[10px] font-semibold bg-muted px-2 py-0.5 rounded-md text-foreground">
                          {top}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 flex items-center justify-between text-xs font-bold text-primary">
                  <span>Explore {tech.name} Ecosystem</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

export default TechnologiesPage;
