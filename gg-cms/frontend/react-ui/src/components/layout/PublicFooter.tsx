import { Link } from 'react-router-dom';
import { GGLogo } from '@/components/shared/GGLogo';

// Only routes that are confirmed to exist in App.tsx router
const COLS = [
  {
    heading: 'Learn',
    links: [
      { label: 'Courses',            to: '/explore/courses'  },
      { label: 'Articles',           to: '/explore/articles' },
      { label: 'Course Bytes',       to: '/explore/bytes'    },
    ],
  },
  {
    heading: 'Discover',
    links: [
      { label: 'Search Content',     to: '/search'           },
      { label: 'Browse Courses',     to: '/explore/courses'  },
      { label: 'Browse Articles',    to: '/explore/articles' },
    ],
  },
  {
    heading: 'My Account',
    links: [
      { label: 'Dashboard',          to: '/dashboard'        },
      { label: 'My Learning',        to: '/my-learning'      },
      { label: 'Notes & Highlights', to: '/notes-highlights' },
      { label: 'Settings',           to: '/account-settings' },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer
      className="w-full mt-8"
      style={{ background: '#0a0b14', color: 'rgba(255,255,255,0.75)' }}
    >
      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* Top: brand + link columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">

          {/* Brand */}
          <div className="col-span-2 md:col-span-1 space-y-4">
            <div className="flex items-center gap-2">
              <GGLogo size={28} />
              <span
                className="font-bold text-base"
                style={{
                  background: 'linear-gradient(135deg, #a78bfa, #60a5fa)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                GeekGully
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              A learning platform for developers — courses, articles and hands-on content to grow your skills.
            </p>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.heading} className="space-y-3">
              <p
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {col.heading}
              </p>
              <ul className="space-y-2">
                {col.links.map(link => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm transition-colors hover:text-white"
                      style={{ color: 'rgba(255,255,255,0.55)' }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="my-8" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />

        {/* Bottom bar — copyright only, no fake legal links */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          <span>© {new Date().getFullYear()} GeekGully. All rights reserved.</span>
          <span>Built for developers who love to learn.</span>
        </div>

      </div>
    </footer>
  );
}
