
export const ROUTES = [
  { path: '/home', file: 'home', tab: 'home', title: 'היום' },
  { path: '/cal', file: 'calendar', tab: 'cal', key: 'cal', title: 'יומן' },
  { path: '/cal/:view/:date', file: 'calendar', tab: 'cal', key: 'cal', title: 'יומן' },

  { path: '/appt/new', file: 'appt-edit', title: 'תור', em: 'חדש', backTo: '/cal' },
  { path: '/appt/:id/edit', file: 'appt-edit', title: 'עריכת', em: 'תור', backTo: '/appt/:id' },
  { path: '/appt/:id', file: 'appt-card', title: 'פרטי', em: 'התור', backTo: '/cal' },

  { path: '/block/new', file: 'block-edit', title: 'אירוע', em: 'חדש', backTo: '/cal' },
  { path: '/block/:id', file: 'block-edit', title: 'עריכת', em: 'אירוע', backTo: '/cal' },

  { path: '/clients', file: 'clients', tab: 'clients', title: 'לקוחות' },
  { path: '/client/new', file: 'client-edit', title: 'לקוח/ה', em: 'חדש/ה', backTo: '/clients' },
  { path: '/client/:id/edit', file: 'client-edit', title: 'עריכת', em: 'לקוח/ה', backTo: '/client/:id' },
  { path: '/client/:id', file: 'client-card', title: 'כרטיס', em: 'לקוח/ה', backTo: '/clients' },

  { path: '/items', file: 'items', title: 'פריטים', backTo: '/more' },
  { path: '/item/new', file: 'item-edit', title: 'פריט', em: 'חדש', backTo: '/items' },
  { path: '/item/:id', file: 'item-edit', title: 'עריכת', em: 'פריט', backTo: '/items' },

  { path: '/reports', file: 'reports', title: 'דוחות', backTo: '/more' },
  { path: '/reports/income', file: 'report-income', title: 'דוח', em: 'הכנסות', backTo: '/reports' },
  { path: '/reports/sales', file: 'report-sales', title: 'דוח', em: 'מכירות', backTo: '/reports' },
  { path: '/reports/print', file: 'report-print', title: 'תצוגה', em: 'להדפסה', backTo: '/reports' },

  { path: '/more', file: 'more', tab: 'more', title: 'עוד' },
  { path: '/_ui', file: 'ui-kit', title: 'ערכת', em: 'העיצוב', backTo: '/more' },
];

export const TABS = [
  { id: 'home', path: '/home', label: 'בית', icon: 'home' },
  { id: 'cal', path: '/cal', label: 'יומן', icon: 'calendar' },
  { id: 'clients', path: '/clients', label: 'לקוחות', icon: 'users' },
  { id: 'more', path: '/more', label: 'עוד', icon: 'more' },
  { id: 'reports', path: '/reports', label: 'דוחות', icon: 'chart', wide: true },
];

export function loadScreen(file) {
  return import(`./screens/${file}.js`);
}
