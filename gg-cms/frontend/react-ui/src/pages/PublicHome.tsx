import React, { useState } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import {
  BookOpen,
  GraduationCap,
  Compass,
  Target,
  Briefcase,
  ArrowRight,
  Clock,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Layers,
  Zap,
  Play,
  HelpCircle,
  FileText,
  Shield,
  Server,
  Cloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function PublicHome() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [activeTimeFilter, setActiveTimeFilter] = useState<'5' | '15' | '30'>('5');

  const popularTechnologies = [
    { name: 'Go', slug: 'go', count: 12 },
    { name: 'Java', slug: 'java', count: 8 },
    { name: 'Python', slug: 'python', count: 15 },
    { name: 'JavaScript', slug: 'javascript', count: 18 },
    { name: 'React', slug: 'react', count: 14 },
    { name: 'Kubernetes', slug: 'kubernetes', count: 10 },
    { name: 'Docker', slug: 'docker', count: 9 },
    { name: 'AWS', slug: 'aws', count: 11 },
    { name: 'GCP', slug: 'gcp', count: 6 },
    { name: 'Azure', slug: 'azure', count: 5 },
    { name: 'PostgreSQL', slug: 'postgresql', count: 8 },
    { name: 'Redis', slug: 'redis', count: 6 },
    { name: 'Kafka', slug: 'kafka', count: 5 },
    { name: 'Linux', slug: 'linux', count: 7 },
    { name: 'Terraform', slug: 'terraform', count: 6 },
  ];

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-20 space-y-16">
        
        {/* Section 1 — Hero */}
        <section className="relative pt-14 pb-16 px-4 sm:px-6 lg:px-8 border-b border-border bg-gradient-to-b from-primary/10 via-primary/5 to-background overflow-hidden">
          <div className="max-w-5xl mx-auto text-center space-y-6">
            <Badge variant="outline" className="px-3.5 py-1 text-xs font-bold text-primary border-primary/30 rounded-full shadow-xs">
              GeekGully Technical Learning Platform
            </Badge>

            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-foreground">
              Learn. Explore. Practice. Grow.
            </h1>

            <p className="text-base sm:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-normal">
              Build practical technology skills through structured courses, career learning paths, articles, and active practice.
            </p>

            {/* "What do you want to do?" Intent Quick-Jump Buttons */}
            <div className="pt-6 space-y-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block">
                What do you want to do today?
              </span>
              <div className="flex flex-wrap justify-center gap-2.5 max-w-3xl mx-auto">
                <Button
                  onClick={() => navigate('/technologies')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  Learn a Technology
                </Button>
                <Button
                  onClick={() => navigate('/learning-paths')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <GraduationCap className="w-4 h-4 text-purple-500" />
                  Follow a Learning Path
                </Button>
                <Button
                  onClick={() => navigate('/explore')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <Compass className="w-4 h-4 text-amber-500" />
                  Explore Resources
                </Button>
                <Button
                  onClick={() => navigate('/practice')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <Target className="w-4 h-4 text-emerald-500" />
                  Practice Knowledge
                </Button>
                <Button
                  onClick={() => navigate('/interview-prep')}
                  variant="outline"
                  className="rounded-2xl h-11 px-4 text-xs font-bold bg-card border-border hover:border-primary hover:bg-primary/5 shadow-xs gap-2"
                >
                  <Briefcase className="w-4 h-4 text-rose-500" />
                  Prepare for an Interview
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6 & 7 — Continue Learning & Recommended Next Step (for returning users) */}
        {isAuthenticated && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Continue Learning */}
              <div className="lg:col-span-2 bg-card border border-border rounded-3xl p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-base font-extrabold flex items-center gap-2">
                    <Play className="w-4 h-4 text-primary fill-primary" />
                    Continue Learning
                  </h3>
                  <span className="text-xs text-muted-foreground font-semibold">Welcome back, {user?.name}</span>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <Badge variant="secondary" className="text-[10px] mb-1 font-bold">Course in Progress</Badge>
                        <h4 className="text-base font-extrabold">Go Backend Engineering</h4>
                        <p className="text-xs text-muted-foreground">12 of 17 lessons completed</p>
                      </div>
                      <Button size="sm" onClick={() => navigate('/course/go-backend-engineering')} className="rounded-xl text-xs font-bold">
                        Continue <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </div>
                    <Progress value={72} className="h-2" />
                  </div>

                  {/* Paths Progress */}
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase block">Backend Path</span>
                      <span className="text-sm font-extrabold text-primary">62%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase block">Cloud Path</span>
                      <span className="text-sm font-extrabold text-foreground">24%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase block">Security Path</span>
                      <span className="text-sm font-extrabold text-foreground">10%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommended Next Step */}
              <div className="bg-gradient-to-br from-primary/10 via-card to-card border border-primary/30 rounded-3xl p-6 flex flex-col justify-between shadow-xs">
                <div className="space-y-3">
                  <Badge className="bg-primary text-primary-foreground text-[10px] font-extrabold uppercase">
                    Your Next Step
                  </Badge>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground font-bold block">You completed:</span>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">✓ Go fundamentals · ✓ HTTP · ✓ REST APIs</p>
                  </div>
                  <div>
                    <h4 className="text-lg font-extrabold text-foreground">Authentication & Authorization</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Learn how OAuth 2.0, PKCE, and JWT authentication work in modern backend applications.
                    </p>
                  </div>
                </div>
                <Button onClick={() => navigate('/article/oauth-2-explained')} className="w-full mt-4 rounded-xl text-xs font-bold">
                  Continue Learning <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Section 5 — Explore Technologies */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Explore Technologies</h2>
              <p className="text-xs text-muted-foreground">Discover structured learning hubs around modern tech stacks.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/technologies')} className="text-xs font-bold text-primary">
              View all technologies →
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {popularTechnologies.map(tech => (
              <button
                key={tech.slug}
                onClick={() => navigate(`/technology/${tech.slug}`)}
                className="p-4 rounded-2xl bg-card border border-border hover:border-primary/50 text-left transition-all hover:shadow-md group"
              >
                <h4 className="font-extrabold text-sm text-foreground group-hover:text-primary transition-colors">{tech.name}</h4>
                <span className="text-[11px] text-muted-foreground font-medium">{tech.count} resources</span>
              </button>
            ))}
          </div>
        </section>

        {/* Section 8 — Learn by Goal Cards */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">What are you trying to achieve?</h2>
            <p className="text-xs text-muted-foreground">Choose a career goal and follow structured, end-to-end guidance.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card border border-border hover:border-primary/50 rounded-3xl p-6 flex flex-col justify-between transition-all hover:shadow-lg space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Server className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-extrabold">Become a Backend Engineer</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Learn programming, APIs, databases, distributed systems, and production engineering.
                </p>
              </div>
              <Button onClick={() => navigate('/learning-paths')} variant="outline" size="sm" className="w-full text-xs font-bold">
                Explore path →
              </Button>
            </div>

            <div className="bg-card border border-border hover:border-primary/50 rounded-3xl p-6 flex flex-col justify-between transition-all hover:shadow-lg space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <Cloud className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-extrabold">Become a Cloud Engineer</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  AWS/GCP/Azure, networking, containers, Kubernetes, and infrastructure.
                </p>
              </div>
              <Button onClick={() => navigate('/learning-paths')} variant="outline" size="sm" className="w-full text-xs font-bold">
                Explore path →
              </Button>
            </div>

            <div className="bg-card border border-border hover:border-primary/50 rounded-3xl p-6 flex flex-col justify-between transition-all hover:shadow-lg space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-extrabold">Become a Security Engineer</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Identity, OAuth, OIDC, PKI, application security, and cloud security.
                </p>
              </div>
              <Button onClick={() => navigate('/learning-paths')} variant="outline" size="sm" className="w-full text-xs font-bold">
                Explore path →
              </Button>
            </div>

            <div className="bg-card border border-border hover:border-primary/50 rounded-3xl p-6 flex flex-col justify-between transition-all hover:shadow-lg space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <Briefcase className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-extrabold">Prepare for Interviews</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Coding, system design, backend, cloud, and security interview questions.
                </p>
              </div>
              <Button onClick={() => navigate('/interview-prep')} variant="outline" size="sm" className="w-full text-xs font-bold">
                Start preparation →
              </Button>
            </div>
          </div>
        </section>

        {/* Section 11 — Quick Learning (Have 5 / 15 / 30 mins?) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
                  <Clock className="w-6 h-6 text-primary" />
                  Quick Learning by Available Time
                </h2>
                <p className="text-xs text-muted-foreground">Select resources tailored precisely to your time window.</p>
              </div>

              {/* Time selector tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTimeFilter('5')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTimeFilter === '5' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Have 5 mins?
                </button>
                <button
                  onClick={() => setActiveTimeFilter('15')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTimeFilter === '15' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Have 15 mins?
                </button>
                <button
                  onClick={() => setActiveTimeFilter('30')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTimeFilter === '30' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Have 30+ mins?
                </button>
              </div>
            </div>

            {/* Quick Learning Item Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {activeTimeFilter === '5' && (
                <>
                  <button onClick={() => navigate('/explore')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-sm transition-all">
                    ⚡ HTTP Status Codes Cheat Sheet (5 min)
                  </button>
                  <button onClick={() => navigate('/explore')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-sm transition-all">
                    ⚡ Git Commands Cheat Sheet (5 min)
                  </button>
                  <button onClick={() => navigate('/explore')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-sm transition-all">
                    ⚡ Docker Commands Cheat Sheet (5 min)
                  </button>
                </>
              )}

              {activeTimeFilter === '15' && (
                <>
                  <button onClick={() => navigate('/article/oauth-2-explained')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-sm transition-all">
                    📖 OAuth 2.0 Explained (10 min)
                  </button>
                  <button onClick={() => navigate('/explore')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-sm transition-all">
                    📖 Go Interfaces Deep Dive (12 min)
                  </button>
                  <button onClick={() => navigate('/explore')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-sm transition-all">
                    📖 Kubernetes Pods & Architecture (15 min)
                  </button>
                </>
              )}

              {activeTimeFilter === '30' && (
                <>
                  <button onClick={() => navigate('/course/go-backend-engineering')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-sm transition-all">
                    🚀 Building a Production Go API (30 min Lab)
                  </button>
                  <button onClick={() => navigate('/explore')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-sm transition-all">
                    🚀 Kubernetes Networking Deep Dive (25 min)
                  </button>
                  <button onClick={() => navigate('/practice')} className="p-4 rounded-2xl bg-muted/40 border border-border hover:border-primary text-left font-bold text-sm transition-all">
                    🚀 Full System Design Practice Test (30 min)
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Section 12 — Practice Preview */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Test yourself</h2>
              <p className="text-xs text-muted-foreground">Reinforce your knowledge through quick quizzes.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/practice')} className="text-xs font-bold text-primary">
              Explore Practice →
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div onClick={() => navigate('/practice')} className="p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all cursor-pointer space-y-2">
              <Badge variant="secondary" className="text-[10px]">Quick Quiz</Badge>
              <h4 className="font-extrabold text-sm">OAuth & OIDC</h4>
              <p className="text-xs text-muted-foreground">5 questions · 10 min</p>
            </div>
            <div onClick={() => navigate('/practice')} className="p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all cursor-pointer space-y-2">
              <Badge variant="secondary" className="text-[10px]">Fundamentals</Badge>
              <h4 className="font-extrabold text-sm">Backend Fundamentals</h4>
              <p className="text-xs text-muted-foreground">25 questions · 15 min</p>
            </div>
            <div onClick={() => navigate('/practice')} className="p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all cursor-pointer space-y-2">
              <Badge variant="secondary" className="text-[10px]">Advanced</Badge>
              <h4 className="font-extrabold text-sm">System Design</h4>
              <p className="text-xs text-muted-foreground">30 questions · 25 min</p>
            </div>
            <div onClick={() => navigate('/practice')} className="p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all cursor-pointer space-y-2">
              <Badge variant="secondary" className="text-[10px]">DevOps</Badge>
              <h4 className="font-extrabold text-sm">Kubernetes Networking</h4>
              <p className="text-xs text-muted-foreground">20 questions · 15 min</p>
            </div>
          </div>
        </section>

      </div>
    </PublicLayout>
  );
}

export default PublicHome;
