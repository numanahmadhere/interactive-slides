// Who to contact and where the company lives. One place, so links stay consistent.
export const SUPPORT_EMAIL = 'hello@densight.com';
export const COMPANY_NAME = 'Densight Labs';
export const COMPANY_URL = 'https://densightlabs.com';

export const supportHref = (subject = 'Densight Slides support') => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
