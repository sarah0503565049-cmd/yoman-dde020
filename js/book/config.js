
export const BOOK = {
  showPrices: true,
  whatsappOnly: ['svc-04'],
  showSeries: false,
  blockMin: { 'svc-01': 120, 'svc-04': 90, 'svc-06': 75, 'svc-07': 60, 'svc-09': 45, 'svc-10': 60 },

  onlineStatus: 'booked',
  minNoticeMin: 24 * 60,
  daysAhead: 42,
  stepMin: 30,

  minGapMin: null,

  hidden: [],

  maxFuturePerPhone: 2,   // תורים עתידיים שנקבעו באתר לאותו טלפון
  maxPerHour: 5,          // תורים מהאתר בשעה האחרונה, לכל העסק
  maxPerDay: 15,          // תורים מהאתר ב-24 השעות האחרונות, לכל העסק

  changeUntilMin: 48 * 60,
  maxMovesPerAppt: 3,     // כמה פעמים אפשר להזיז אותו תור בקישור (הגנה; 0 = בלי תקרה). לא נשלח לדף

  whatsapp: { label: '058-7801908', href: 'https://wa.me/972587801908' },
};
