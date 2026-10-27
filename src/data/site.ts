export const site = {
  url: 'https://nordicchess.fi',
  email: 'info@nordicchess.fi',
  organiser: 'Nordic Chess Festival ry',
  // Interim newsletter signup. Replace when a proper mailing list provider is chosen.
  newsletterUrl:
    'https://docs.google.com/forms/d/e/1FAIpQLSc2lMLuaor4bIIDlV-7nadU3bqa1wGkDUoC3rNvhu9o2xZ1Gg/viewform',
  // Set when the Main Event has been published on chess-results.com.
  chessResultsUrl: null as string | null,
  partners: [
    { name: 'Chess Tournament Calendar', url: 'https://chesstournamentcalendar.com' },
    { name: 'The Chess Herald', url: 'https://chessherald.com' },
  ],
} as const;
