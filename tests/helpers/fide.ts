// A small stand-in for FIDE's combined player list, stored the way the uploader stores it in R2.
import { buildShards } from '../../scripts/fide-list.mjs';
import { clearFideCache } from '../../worker/fide.ts';

const player = (id: string, name: string, country: string, title: string, rating: number, birth: number, wTitle = '') =>
  `<player><fideid>${id}</fideid><name>${name}</name><country>${country}</country><sex>M</sex><title>${title}</title><w_title>${wTitle}</w_title>` +
  `<rating>${rating}</rating><games>0</games><k>20</k><rapid_rating>0</rapid_rating><blitz_rating>0</blitz_rating><birthday>${birth}</birthday><flag></flag></player>`;

export const XML = `<playerslist>
${player('100001', 'Example, Testi', 'FIN', 'FM', 2216, 1964)}
${player('100002', 'Sample, Anna', 'FIN', '', 1722, 1985)}
${player('100010', 'Test, Anna', 'FIN', '', 1850, 1990)}
${player('100011', 'Grandmaster, Gina', 'FIN', 'GM', 2600, 1980)}
${player('100012', 'Junior, Jussi', 'FIN', '', 1850, 2012)}
${player('100013', 'Senior, Sakari', 'FIN', '', 1850, 1955)}
${player('100014', 'Unrated, Ulla', 'FIN', '', 0, 1990)}
${player('100015', 'Nobirth, Nina', 'FIN', '', 1850, 0)}
${player('100020', '=HYPERLINK("x")', 'FIN', '', 1850, 1990)}
${player('700001', 'Doe, Jane', 'ENG', 'GM', 2500, 2012, 'WGM')}
${player('700002', 'Ivanov, Ivan', 'RUS', '', 2100, 1990)}
${player('700003', 'Petrov, Petr', 'BLR', 'IM', 2400, 1985)}
</playerslist>`;

/** The FIDE_LIST bucket with the fixture list: file dated 2027-02-28, which FIDE labels the March 2027 list. */
export function fideBucket() {
  clearFideCache();
  const { shards } = buildShards(XML, '2027-02-28', '2027-03');
  const object = (value: unknown) => ({ json: async () => value });
  return {
    get: async (key: string) => {
      if (key === 'current.json') return object({ prefix: '2027-03', month: '2027-03', updated: '2027-02-28' });
      const n = Number(/^2027-03\/(\d+)\.json$/.exec(key)?.[1]);
      return Number.isInteger(n) && shards[n] ? object(shards[n]) : null;
    },
  };
}
