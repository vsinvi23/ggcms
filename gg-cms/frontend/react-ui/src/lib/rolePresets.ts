import type { ExperienceLevel, RoleType } from '@/api/types';

export interface RolePreset {
  roleType: RoleType;
  label: string;
  description: string;
  icon: string;
  experienceLevel: ExperienceLevel;
  learningGoals: string;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    roleType: 'learner',
    label: 'Learner',
    icon: '🎓',
    description: 'Exploring and building new skills',
    experienceLevel: 'beginner',
    learningGoals: 'Build foundational skills and explore new topics at my own pace.',
  },
  {
    roleType: 'developer',
    label: 'Developer',
    icon: '💻',
    description: 'Building software systems',
    experienceLevel: 'intermediate',
    learningGoals: 'Sharpen engineering skills and keep up with modern practices.',
  },
  {
    roleType: 'architect',
    label: 'Architect',
    icon: '🏗️',
    description: 'Designing scalable systems',
    experienceLevel: 'advanced',
    learningGoals: 'Design resilient architectures and understand system trade-offs.',
  },
  {
    roleType: 'manager',
    label: 'Manager / Lead',
    icon: '📋',
    description: 'Leading technical teams',
    experienceLevel: 'intermediate',
    learningGoals: 'Lead technical teams effectively and stay current with industry trends.',
  },
  {
    roleType: 'researcher',
    label: 'Researcher',
    icon: '🔬',
    description: 'Academic or R&D focus',
    experienceLevel: 'advanced',
    learningGoals: 'Deep dive into emerging technologies and research-grade content.',
  },
  {
    roleType: 'executive',
    label: 'Executive / CISO',
    icon: '📊',
    description: 'Strategic technology oversight',
    experienceLevel: 'beginner',
    learningGoals: 'Stay informed on technology strategy and business impact.',
  },
];
