import { User, UserRole, UserStatus } from '@/types/user';

const roles: UserRole[] = ['Admin', 'Viewer', 'Editor', 'Moderator'];
const statuses: UserStatus[] = ['active', 'deactivated', 'invited'];

const firstNames = [
  'James', 'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'William', 'Sophia',
  'Oliver', 'Isabella', 'Benjamin', 'Mia', 'Elijah', 'Charlotte', 'Lucas',
  'Amelia', 'Mason', 'Harper', 'Logan', 'Evelyn', 'Alexander', 'Abigail',
  'Ethan', 'Emily', 'Jacob', 'Elizabeth', 'Michael', 'Sofia', 'Daniel', 'Avery'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez'
];

const generateDate = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
};

const generateEmail = (firstName: string, lastName: string): string => {
  const domains = ['company.com', 'org.net', 'business.io'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
};

export const mockUsers: User[] = Array.from({ length: 129 }, (_, index) => {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const daysAgo = Math.floor(Math.random() * 365);
  
  // Distribute statuses: 60% active, 30% deactivated, 10% invited
  let status: UserStatus;
  const rand = Math.random();
  if (rand < 0.6) status = 'active';
  else if (rand < 0.9) status = 'deactivated';
  else status = 'invited';

  return {
    id: `user-${index + 1}`,
    firstName,
    lastName,
    email: generateEmail(firstName, lastName),
    role: roles[Math.floor(Math.random() * roles.length)],
    status,
    createdAt: generateDate(daysAgo),
    lastLogin: status === 'active' ? generateDate(Math.floor(Math.random() * 30)) : undefined,
  };
});

// Ensure we have specific counts that match the reference
export const getUserCounts = (users: User[]) => ({
  active: users.filter(u => u.status === 'active').length,
  deactivated: users.filter(u => u.status === 'deactivated').length,
  invited: users.filter(u => u.status === 'invited').length,
  total: users.length,
});
