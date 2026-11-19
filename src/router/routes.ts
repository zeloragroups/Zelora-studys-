import type { PortalScope, UserRole } from '../types';

export const ROUTES = {
  HOME: '/',
  ADMIN_LOGIN: '/admin/login',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_WEBSITE: '/admin/website',
  ADMIN_APP: '/admin/app',
  PORTAL_LOGIN: '/portal/login',
  PORTAL_FORGOT_PASSWORD: '/portal/forgot-password',
  PORTAL_TEACHER: '/portal/teacher',
  PORTAL_STUDENT: '/portal/student',
} as const;

export type AppRoutePath = (typeof ROUTES)[keyof typeof ROUTES];

export interface RoutePolicy {
  path: string;
  requiresAuth: boolean;
  allowedRoles?: readonly UserRole[];
  portalScope?: PortalScope;
}

export const ROUTE_POLICIES: readonly RoutePolicy[] = [
  { path: ROUTES.HOME, requiresAuth: false },
  { path: ROUTES.ADMIN_LOGIN, requiresAuth: false, portalScope: 'admin_portal' },
  { path: ROUTES.PORTAL_LOGIN, requiresAuth: false, portalScope: 'member_portal' },
  { path: ROUTES.PORTAL_FORGOT_PASSWORD, requiresAuth: false, portalScope: 'member_portal' },
  {
    path: ROUTES.ADMIN_DASHBOARD,
    requiresAuth: true,
    allowedRoles: ['admin'],
    portalScope: 'admin_portal',
  },
  {
    path: ROUTES.ADMIN_WEBSITE,
    requiresAuth: true,
    allowedRoles: ['admin'],
    portalScope: 'admin_portal',
  },
  {
    path: ROUTES.ADMIN_APP,
    requiresAuth: true,
    allowedRoles: ['admin'],
    portalScope: 'admin_portal',
  },
  {
    path: ROUTES.PORTAL_TEACHER,
    requiresAuth: true,
    allowedRoles: ['teacher'],
    portalScope: 'member_portal',
  },
  {
    path: ROUTES.PORTAL_STUDENT,
    requiresAuth: true,
    allowedRoles: ['student'],
    portalScope: 'member_portal',
  },
];

export function normalizePath(pathname: string): string {
  const clean = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return clean || '/';
}

export function getDefaultRouteForRole(role: UserRole): AppRoutePath {
  switch (role) {
    case 'admin':
      return ROUTES.ADMIN_DASHBOARD;
    case 'teacher':
      return ROUTES.PORTAL_TEACHER;
    case 'student':
      return ROUTES.PORTAL_STUDENT;
  }
}

export function getLoginRouteForPath(pathname: string): AppRoutePath {
  const normalized = normalizePath(pathname);
  if (normalized.startsWith('/admin')) {
    return ROUTES.ADMIN_LOGIN;
  }
  return ROUTES.PORTAL_LOGIN;
}

export function findRoutePolicy(pathname: string): RoutePolicy | undefined {
  const normalized = normalizePath(pathname);
  return ROUTE_POLICIES.find((p) => p.path === normalized);
}
