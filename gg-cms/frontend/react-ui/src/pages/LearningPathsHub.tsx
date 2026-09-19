import React, { useState } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, GraduationCap, Clock, Layers, Filter, CheckCircle2, Lock, ArrowRight, BookOpen, FileText, Target, HelpCircle, Compass, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';

interface PathStage {
  id: string;
  stageNumber: number;
  title: string;
  description: string;
  whyItMatters: string;
  prerequisites: string[];
  status: 'completed' | 'in_progress' | 'upcoming';
  progressPercentage?: number;
  resources: {
    title: string;
    type: 'Course' | 'Article' | 'Cheat Sheet' | 'Quiz' | 'Interview Questions';
    estimatedMinutes: number;
    url: string;
  }[];
}

interface LearningPathItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  category: 'Career' | 'Technology' | 'Domain';
  level: string;
  stagesCount: number;
  resourcesCount: number;
  estimatedHours: number;
  skills: string[];
  progress: number;
  stages: PathStage[];
}

const mockPaths: LearningPathItem[] = [
  {
    id: 'lp-1',
    slug: 'backend-engineer',
    title: 'Backend Engineer',
    subtitle: 'Learn programming, APIs, databases, distributed systems, and production engineering.',
    category: 'Career',
    level: 'Beginner → Advanced',
    stagesCount: 8,
    resourcesCount: 78,
    estimatedHours: 120,
    skills: ['Go', 'API Design', 'Databases', 'Distributed Systems', 'Cloud'],
    progress: 60,
    stages: [
      {
        id: 'st-1',
        stageNumber: 1,
        title: 'Programming Fundamentals',
        description: 'Core syntax, data types, control structures, and basic algorithms.',
        whyItMatters: 'Every backend engineer needs strong foundational programming logic.',
        prerequisites: ['None'],
        status: 'completed',
        progressPercentage: 100,
        resources: [
          { title: 'Go Fundamentals Course', type: 'Course', estimatedMinutes: 180, url: '/course/go-backend-engineering' },
          { title: 'Data Structures Quick Reference', type: 'Cheat Sheet', estimatedMinutes: 10, url: '/explore' },
        ],
      },
      {
        id: 'st-2',
        stageNumber: 2,
        title: 'Go Language In-Depth',
        description: 'Pointers, interfaces, goroutines, channels, and package management.',
        whyItMatters: 'Go powers high-concurrency microservices across modern backend tech stacks.',
        prerequisites: ['Programming Fundamentals'],
        status: 'completed',
        progressPercentage: 100,
        resources: [
          { title: 'Go Concurrency Patterns', type: 'Article', estimatedMinutes: 15, url: '/explore' },
          { title: 'Go Fundamentals Quiz', type: 'Quiz', estimatedMinutes: 10, url: '/practice' },
        ],
      },
      {
        id: 'st-3',
        stageNumber: 3,
        title: 'Web & HTTP Architecture',
        description: 'HTTP verbs, headers, RESTful standards, JSON serialization, and status codes.',
        whyItMatters: 'Before building backend APIs, you need deep comprehension of the HTTP protocol.',
        prerequisites: ['Go Language In-Depth'],
        status: 'in_progress',
        progressPercentage: 60,
        resources: [
          { title: 'HTTP Fundamentals', type: 'Course', estimatedMinutes: 120, url: '/course/go-backend-engineering' },
          { title: 'HTTP Deep Dive', type: 'Article', estimatedMinutes: 20, url: '/explore' },
          { title: 'HTTP Status Codes Cheat Sheet', type: 'Cheat Sheet', estimatedMinutes: 5, url: '/explore' },
          { title: 'HTTP Fundamentals Quiz', type: 'Quiz', estimatedMinutes: 15, url: '/practice' },
          { title: '20 HTTP Interview Questions', type: 'Interview Questions', estimatedMinutes: 25, url: '/interview-prep' },
        ],
      },
      {
        id: 'st-4',
        stageNumber: 4,
        title: 'Databases & Persistence',
        description: 'Relational DBs, PostgreSQL, indexing, ACID transactions, and Redis caching.',
        whyItMatters: 'Data integrity and storage performance dictate modern API reliability.',
        prerequisites: ['Web & HTTP Architecture'],
        status: 'upcoming',
        resources: [
          { title: 'PostgreSQL Indexing & Optimization', type: 'Article', estimatedMinutes: 25, url: '/explore' },
        ],
      },
    ],
  },
  {
    id: 'lp-2',
    slug: 'cloud-engineer',
    title: 'Cloud Engineer',
    subtitle: 'AWS/GCP, networking, containers, Kubernetes, Infrastructure-as-Code, and monitoring.',
    category: 'Career',
    level: 'Beginner → Advanced',
    stagesCount: 7,
    resourcesCount: 64,
    estimatedHours: 95,
    skills: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD'],
    progress: 24,
    stages: [
      {
        id: 'st-cloud-1',
        stageNumber: 1,
        title: 'Cloud & Networking Basics',
        description: 'VPCs, subnets, DNS, routing tables, and IP addressing.',
        whyItMatters: 'Cloud infrastructure operates on fundamental computer network principles.',
        prerequisites: ['None'],
        status: 'completed',
        progressPercentage: 100,
        resources: [{ title: 'Networking for Cloud Engineers', type: 'Course', estimatedMinutes: 150, url: '/courses' }],
      },
    ],
  },
  {
    id: 'lp-3',
    slug: 'security-engineer',
    title: 'Security Engineer',
    subtitle: 'Identity, OAuth 2.0, OIDC, PKI, application security, threat modeling, and cloud security.',
    category: 'Career',
    level: 'Intermediate → Advanced',
    stagesCount: 6,
    resourcesCount: 52,
    estimatedHours: 80,
    skills: ['OAuth 2.0', 'OIDC', 'JWT', 'PKI', 'AppSec'],
    progress: 10,
    stages: [],
  },
];

export function LearningPathsHub() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activePath, setActivePath] = useState<LearningPathItem | null>(null);
  const [selectedStage, setSelectedStage] = useState<PathStage | null>(null);

  const categories = ['All', 'Career', 'Technology', 'Domain'];

  const filteredPaths = mockPaths.filter(path => {
    const matchesSearch = searchQuery === '' || 
      path.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      path.subtitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || path.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getResourceTypeIcon = (type: string) => {
    switch (type) {
      case 'Course': return <BookOpen className="w-4 h-4 text-blue-500" />;
      case 'Article': return <FileText className="w-4 h-4 text-emerald-500" />;
      case 'Cheat Sheet': return <Compass className="w-4 h-4 text-amber-500" />;
      case 'Quiz': return <Target className="w-4 h-4 text-purple-500" />;
      case 'Interview Questions': return <HelpCircle className="w-4 h-4 text-rose-500" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-12">
        
        {/* Clean Sub-Header Bar — Title Left, Centered Search Bar */}
        <div className="border-b border-border bg-card/40 px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 shrink-0 sm:w-1/4">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight">
                  Learning Paths
                </h1>
                <p className="text-[11px] text-muted-foreground hidden lg:block">Guided roadmaps</p>
              </div>
            </div>

            {/* Centered Search Bar */}
            <div className="relative w-full max-w-md sm:w-1/2 flex justify-center">
              <div className="relative w-full">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search learning paths..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-9 text-xs rounded-xl bg-background border-border shadow-2xs w-full"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Right Spacer */}
            <div className="hidden sm:block sm:w-1/4"></div>
          </div>
        </div>

        {/* 2-Column Space-Optimized Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Left-Aligned Compact Filter Panel */}
            <div className="md:col-span-1 space-y-3 bg-card border border-border rounded-2xl p-3.5 h-fit shadow-2xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Filter className="w-3 h-3 text-primary" />
                  Category
                </span>
                {selectedCategory !== 'All' && (
                  <button onClick={() => setSelectedCategory('All')} className="text-[11px] text-primary hover:underline font-semibold">
                    Reset
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      selectedCategory === cat
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Right Column — Learning Path Cards */}
            <div className="md:col-span-3 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredPaths.map(path => (
                  <div
                    key={path.id}
                    onClick={() => navigate(`/learn/${path.slug}`)}
                    className="bg-card border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md group cursor-pointer"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px] font-bold">
                          {path.category}
                        </Badge>
                        <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {path.level}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold text-foreground group-hover:text-primary transition-colors mb-0.5">
                          {path.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {path.subtitle}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium pt-1">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-primary" />
                          {path.stagesCount} stages · {path.resourcesCount} items
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          ~{path.estimatedHours}h
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {path.skills.map(skill => (
                          <span key={skill} className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border mt-4 space-y-2">
                      {path.progress > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="text-primary">{path.progress}%</span>
                          </div>
                          <Progress value={path.progress} className="h-1.5" />
                        </div>
                      )}

                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/learn/${path.slug}`);
                        }}
                        className="w-full justify-between font-bold rounded-xl text-xs h-9 bg-primary text-primary-foreground"
                      >
                        <span>{path.progress > 0 ? 'Continue Path' : 'View Path Journey'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

export default LearningPathsHub;
