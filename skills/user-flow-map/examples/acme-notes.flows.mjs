// Example data for render-flow-map.mjs: "Acme Notes", a fictional note-taking
// SaaS with team invites, a Pro plan on Stripe, and an admin console.
//
//   node ../scripts/render-flow-map.mjs acme-notes.flows.mjs /tmp/acme-notes.svg
//
// Format reference: ../references/data-format.md

export const META = {
  title: 'Acme Notes · User flow map',
  subtitle: 'Every screen (box), every action on it (bullets), every user type (line colour). Fictional example.',
  footer: 'Example data: skills/user-flow-map/examples/acme-notes.flows.mjs',
};

// Lanes are access zones, top to bottom. `rows` = how many card rows the lane holds.
export const LANES = [
  { id: 'public', name: 'Public', color: '#2F6FDB', tint: '#EEF3FC', rows: 2,
    notes: ['Anyone, no account.'] },
  { id: 'members', name: 'Members', color: '#B97A06', tint: '#FCF5E6', rows: 2,
    notes: ['Signed in.', 'Guests are sent', 'to /login.'] },
  { id: 'system', name: 'System', color: '#0F8B7E', tint: '#E8F5F3', rows: 1,
    notes: ['No person:', 'webhooks, cron,', 'email.'] },
  { id: 'admin', name: 'Admin', color: '#C0392B', tint: '#FBEDEB', rows: 1,
    notes: ['role = admin.'] },
];

// User types. Each step line and moving dot uses its actor's colour.
export const ACTORS = {
  visitor: { label: 'Visitor', color: '#2F6FDB' },
  member: { label: 'Member', color: '#C8870A' },
  invitee: { label: 'Invited teammate', color: '#8E44AD' },
  system: { label: 'System', color: '#0F8B7E' },
  admin: { label: 'Admin', color: '#C0392B' },
};

// kind: page (default) | modal | gate | end | service. col may be fractional (1.5).
export const NODES = {
  home: { lane: 'public', col: 0, row: 0, route: '/', name: 'Landing',
    actions: ['Start free', 'Log in', 'See pricing'] },
  signup: { lane: 'public', col: 1, row: 0, route: '/signup', name: 'Sign up',
    actions: ['Email + password', 'Continue with Google'] },
  login: { lane: 'public', col: 2, row: 0, route: '/login', name: 'Log in',
    actions: ['Email + password', 'Forgot password'] },
  pricing: { lane: 'public', col: 4, row: 0, route: '/pricing', name: 'Pricing',
    actions: ['Free vs Pro', 'Start free'] },
  gate: { lane: 'public', col: 1.5, row: 1, kind: 'gate', name: 'Session check',
    actions: ['New user: workspace', 'Invite: join team'] },
  reset: { lane: 'public', col: 3, row: 1, route: '/reset-password', name: 'Reset password',
    actions: ['Request link', 'Set new password'] },
  invite: { lane: 'public', col: 5, row: 1, route: '/invite/[token]', name: 'Accept invite',
    actions: ['See team name', 'Accept → sign up'] },

  dashboard: { lane: 'members', col: 1, row: 0, route: '/app', name: 'Dashboard',
    actions: ['Recent notes', 'Search', 'New note', 'Open team / billing'] },
  editor: { lane: 'members', col: 2, row: 0, route: '/app/notes/[id]', name: 'Note editor',
    actions: ['Edit (autosave)', 'Share', 'Move to trash'] },
  shareDlg: { lane: 'members', col: 3, row: 0, kind: 'modal', route: 'dialog', name: 'Share',
    actions: ['Copy link', 'Invite by email'] },
  team: { lane: 'members', col: 4, row: 0, route: '/app/team', name: 'Team',
    actions: ['Invite member', 'Change role', 'Remove member'] },
  billing: { lane: 'members', col: 5, row: 0, route: '/app/billing', name: 'Billing',
    actions: ['Upgrade to Pro', 'Invoices', 'Cancel plan'] },
  settings: { lane: 'members', col: 1, row: 1, route: '/app/settings', name: 'Settings',
    actions: ['Profile', 'Sign out', 'Delete account'] },
  loggedOut: { lane: 'members', col: 2, row: 1, kind: 'end', name: 'Signed out → /',
    actions: ['Session cleared'] },

  cron: { lane: 'system', col: 3, row: 0, kind: 'service', route: 'Cron · daily', name: 'Trial check',
    actions: ['Trial ends in 3 days'] },
  email: { lane: 'system', col: 4, row: 0, kind: 'service', route: 'Postmark', name: 'Email',
    actions: ['Invites', 'Reset links', 'Receipts'] },
  stripe: { lane: 'system', col: 5, row: 0, kind: 'service', route: 'Stripe', name: 'Checkout',
    actions: ['Card payment', 'Refunds'] },
  stripeHook: { lane: 'system', col: 6, row: 0, kind: 'service', route: 'Stripe webhook', name: 'Billing events',
    actions: ['Plan → Pro', 'Refund → Free'] },

  adminUsers: { lane: 'admin', col: 4, row: 0, route: '/admin/users', name: 'Users',
    actions: ['Search', 'Resend invite'] },
  adminBilling: { lane: 'admin', col: 6, row: 0, route: '/admin/billing', name: 'Billing',
    actions: ['Find invoice', 'Refund'] },
};

// Every possible move. EDGES may be a plain object, or a function that gets the
// layout helper L (see data-format.md) for routing `via` points through free channels.
export const EDGES = (L) => ({
  home_signup: { from: 'home', to: 'signup' },
  pricing_signup: { from: 'pricing', to: 'signup', fromSide: 'B', toSide: 'B', toOff: 50,
    via: [[L.cx('pricing'), L.below('public', 0)], [L.cx('signup') + 50, L.below('public', 0)]] },
  signup_gate: { from: 'signup', to: 'gate', fromSide: 'B', fromOff: -20, toSide: 'L',
    labelAt: [L.cx('signup') - 70, L.below('public', 0)] },
  login_gate: { from: 'login', to: 'gate', fromSide: 'B', fromOff: -40, toSide: 'R' },
  gate_dashboard: { from: 'gate', to: 'dashboard', fromSide: 'B', toSide: 'T', toOff: 30 },
  dashboard_editor: { from: 'dashboard', to: 'editor' },
  editor_share: { from: 'editor', to: 'shareDlg' },
  share_email: { from: 'shareDlg', to: 'email', fromSide: 'B', toSide: 'T', toOff: -40 },
  dashboard_team: { from: 'dashboard', to: 'team', fromSide: 'B', fromOff: 40, toSide: 'B',
    via: [[L.cx('dashboard') + 40, L.below('members', 0)], [L.cx('team'), L.below('members', 0)]] },
  team_email: { from: 'team', to: 'email', fromSide: 'B', fromOff: 40, toSide: 'T', toOff: 40 },
  email_invite: { from: 'email', to: 'invite', fromSide: 'R', toSide: 'L',
    via: [[L.gapX(4), L.cy('email')], [L.gapX(4), L.cy('invite')]] },
  invite_gate: { from: 'invite', to: 'gate', fromSide: 'B', toSide: 'R',
    via: [[L.cx('invite'), L.below('public', 1)], [L.cx('gate') + 130, L.below('public', 1)], [L.cx('gate') + 130, L.cy('gate')]] },
  login_reset: { from: 'login', to: 'reset', fromSide: 'B', fromOff: 40, toSide: 'T' },
  reset_email: { from: 'reset', to: 'email', fromSide: 'B', fromOff: 20, toSide: 'L', toOff: -12,
    via: [[L.cx('reset') + 20, L.below('public', 1, -1)], [L.gapX(3) + 12, L.below('public', 1, -1)], [L.gapX(3) + 12, L.cy('email') - 12]] },
  email_reset: { from: 'email', to: 'reset', fromSide: 'L', fromOff: 12, toSide: 'B', toOff: -20,
    via: [[L.gapX(3) - 12, L.cy('email') + 12], [L.gapX(3) - 12, L.below('public', 1, 1)], [L.cx('reset') - 20, L.below('public', 1, 1)]] },
  billing_stripe: { from: 'billing', to: 'stripe', fromSide: 'B', toSide: 'T' },
  stripe_hook: { from: 'stripe', to: 'stripeHook' },
  hook_billing: { from: 'stripeHook', to: 'billing', fromSide: 'T', toSide: 'B', toOff: 50 },
  stripe_fail: { from: 'stripe', to: 'billing', fromSide: 'T', fromOff: -50, toSide: 'B', toOff: -50, alt: true,
    labelAt: [L.cx('stripe') - 50, L.below('members', 1)] },
  hook_email: { from: 'stripeHook', to: 'email', fromSide: 'B', toSide: 'B',
    via: [[L.cx('stripeHook'), L.below('system', 0)], [L.cx('email'), L.below('system', 0)]] },
  cron_email: { from: 'cron', to: 'email' },
  dashboard_settings: { from: 'dashboard', to: 'settings', fromSide: 'B', fromOff: -40, toSide: 'T', toOff: -40 },
  settings_out: { from: 'settings', to: 'loggedOut' },
  adminbilling_stripe: { from: 'adminBilling', to: 'stripe', fromSide: 'T', fromOff: -40, toSide: 'B', toOff: 40,
    via: [[L.cx('adminBilling') - 40, L.below('system', 0, 1)], [L.cx('stripe') + 40, L.below('system', 0, 1)]] },
  adminusers_email: { from: 'adminUsers', to: 'email', fromSide: 'T', toSide: 'B', toOff: 40 },
});

// The tour: each flow plays in order. Steps are [edgeId, actor, label].
export const FLOWS = [
  { title: 'Sign up', who: 'Visitor → Member',
    desc: 'Sign up with email or Google. The session check creates a workspace and opens the dashboard.',
    steps: [
      ['home_signup', 'visitor', 'Start free'],
      ['signup_gate', 'visitor', 'Create account'],
      ['gate_dashboard', 'system', 'New workspace'],
      ['dashboard_editor', 'member', 'New note'],
    ] },
  { title: 'Invite a teammate', who: 'Member → Invited teammate',
    desc: 'A member invites someone from the share dialog. The email link opens the invite page; signing up joins the team.',
    steps: [
      ['editor_share', 'member', 'Share'],
      ['share_email', 'member', 'Invite by email'],
      ['email_invite', 'system', 'Invite link'],
      ['invite_gate', 'invitee', 'Accept → sign up'],
      ['gate_dashboard', 'system', 'Joins the team'],
    ] },
  { title: 'Upgrade to Pro', who: 'Member',
    desc: 'Checkout runs on Stripe. The webhook switches the plan and emails a receipt. A declined card returns to billing.',
    steps: [
      ['billing_stripe', 'member', 'Upgrade to Pro'],
      ['stripe_hook', 'system', 'Payment succeeded'],
      ['hook_billing', 'system', 'Plan = Pro'],
      ['hook_email', 'system', 'Receipt'],
      ['stripe_fail', 'system', 'Card declined'],
    ] },
  { title: 'Forgot password', who: 'Visitor',
    desc: 'The reset page emails a one-time link. The link opens the same page to set a new password.',
    steps: [
      ['login_reset', 'visitor', 'Forgot password'],
      ['reset_email', 'visitor', 'Request link'],
      ['email_reset', 'system', 'Reset link'],
    ] },
  { title: 'Account', who: 'Member',
    desc: 'Settings holds the profile, sign out and account deletion. Both end on the landing page, signed out.',
    steps: [
      ['dashboard_settings', 'member', 'Settings'],
      ['settings_out', 'member', 'Sign out'],
    ] },
  { title: 'Admin', who: 'Admin',
    desc: 'Admins refund an invoice (the webhook drops the plan to Free) and resend invites.',
    steps: [
      ['adminbilling_stripe', 'admin', 'Refund'],
      ['stripe_hook', 'system', 'Refund event'],
      ['adminusers_email', 'admin', 'Resend invite'],
    ] },
];
