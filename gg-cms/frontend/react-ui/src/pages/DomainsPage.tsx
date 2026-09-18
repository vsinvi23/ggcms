import React, { useState } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, Shield, Server, Cloud, Cpu, Database, Network, Code, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

interface DomainTreeItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: any;
  subdomains: {
    name: string;
    slug: string;
    technologies: string[];
  }[];
}

const mockDomains: DomainTreeItem[] = [
  {
    id: 'd-1',
    slug: 'security',
    name: 'Cyber Security & Identity',
    description: 'Identity management, OAuth 2.0, OIDC, application security, PKI, and cloud security controls.',
    icon: Shield,
    subdomains: [
      { name: 'Identity & Access Management', slug: 'identity', technologies: ['OAuth 2.0', 'OIDC', 'SAML', 'PKI', 'JWT'] },
      { name: 'Application Security', slug: 'appsec', technologies: ['OWASP Top 10', 'SAST', 'DAST', 'Threat Modeling'] },
      { name: 'Cloud & Network Security', slug: 'cloud-sec', technologies: ['AWS IAM', 'VPC Firewalls', 'TLS/SSL', 'Zero Trust'] },
    ],
  },
  {
    id: 'd-2',
    slug: 'backend',
    name: 'Backend Engineering',
    description: 'API design, microservices, databases, caching, concurrency, and high-concurrency systems.',
    icon: Server,
    subdomains: [
      { name: 'Programming Languages', slug: 'lang', technologies: ['Go', 'Java', 'Python', 'Node.js', 'Rust'] },
      { name: 'Web & API Protocols', slug: 'api', technologies: ['REST', 'gRPC', 'GraphQL', 'HTTP/2', 'WebSockets'] },
      { name: 'Data & Caching', slug: 'data', technologies: ['PostgreSQL', 'Redis', 'MongoDB', 'Kafka'] },
    ],
  },
  {
    id: 'd-3',
    slug: 'cloud-devops',
    name: 'Cloud & DevOps',
    description: 'Cloud infrastructure, container orchestration, CI/CD pipelines, and Infrastructure-as-Code.',
    icon: Cloud,
    subdomains: [
      { name: 'Container & Orchestration', slug: 'containers', technologies: ['Docker', 'Kubernetes', 'Helm', 'Podman'] },
      { name: 'Cloud Platforms', slug: 'platforms', technologies: ['AWS', 'GCP', 'Azure'] },
      { name: 'Infrastructure as Code', slug: 'iac', technologies: ['Terraform', 'Ansible', 'CloudFormation'] },
    ],
  },
];

export function DomainsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-16">
        
        <div className="relative border-b border-border bg-gradient-to-b from-primary/5 via-transparent to-background pt-12 pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-4">
            <Badge variant="outline" className="px-3 py-1 text-xs font-semibold text-primary border-primary/30 rounded-full">
              Knowledge Domains
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              Domain Directory
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Explore structured technical domains and subdomains spanning security, backend, cloud, and infrastructure.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
          <div className="space-y-8">
            {mockDomains.map(domain => {
              const IconComp = domain.icon;
              return (
                <div key={domain.id} className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <IconComp className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-extrabold text-foreground">{domain.name}</h2>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">{domain.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    {domain.subdomains.map(sub => (
                      <div key={sub.slug} className="p-4 rounded-2xl bg-muted/40 border border-border space-y-2">
                        <h4 className="text-sm font-bold text-foreground">{sub.name}</h4>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {sub.technologies.map(t => (
                            <span key={t} className="text-[10px] font-semibold bg-background border border-border px-2 py-0.5 rounded-md text-foreground">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

export default DomainsPage;
