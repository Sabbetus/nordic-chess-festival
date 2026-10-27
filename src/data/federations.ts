// FIDE federations: FIDE code and ISO 3166 region code. Region names come from Intl.DisplayNames in the
// player's language; the few federations without a plain ISO region (England, Scotland, Wales, FIDE flag,
// Chinese Taipei) have their own names.

const RAW = `
AFG AF,ALB AL,ALG DZ,AND AD,ANG AO,ANT AG,ARG AR,ARM AM,ARU AW,AUS AU,AUT AT,AZE AZ,BAH BS,BAN BD,BAR BB,
BDI BI,BEL BE,BEN BJ,BER BM,BHU BT,BIH BA,BIZ BZ,BLR BY,BOL BO,BOT BW,BRA BR,BRN BH,BRU BN,BUL BG,BUR BF,
CAF CF,CAM KH,CAN CA,CAY KY,CHA TD,CHI CL,CHN CN,CIV CI,CMR CM,COD CD,COL CO,COM KM,CPV CV,CRC CR,CRO HR,
CUB CU,CYP CY,CZE CZ,DEN DK,DJI DJ,DMA DM,DOM DO,ECU EC,EGY EG,ERI ER,ESA SV,ESP ES,EST EE,ETH ET,FAI FO,
FIJ FJ,FIN FI,FRA FR,GAB GA,GAM GM,GCI GG,GEO GE,GEQ GQ,GER DE,GHA GH,GRE GR,GRN GD,GUA GT,GUM GU,GUY GY,
HAI HT,HKG HK,HON HN,HUN HU,INA ID,IND IN,IOM IM,IRI IR,IRL IE,IRQ IQ,ISL IS,ISR IL,ISV VI,ITA IT,IVB VG,
JAM JM,JCI JE,JOR JO,JPN JP,KAZ KZ,KEN KE,KGZ KG,KOR KR,KOS XK,KSA SA,KUW KW,LAO LA,LAT LV,LBA LY,LBN LB,
LBR LR,LCA LC,LES LS,LIE LI,LTU LT,LUX LU,MAC MO,MAD MG,MAR MA,MAS MY,MAW MW,MDA MD,MDV MV,MEX MX,MGL MN,
MKD MK,MLI ML,MLT MT,MNC MC,MNE ME,MOZ MZ,MRI MU,MTN MR,MYA MM,NAM NA,NCA NI,NED NL,NEP NP,NGR NG,NIG NE,
NOR NO,NRU NR,NZL NZ,OMA OM,PAK PK,PAN PA,PAR PY,PER PE,PHI PH,PLE PS,PLW PW,PNG PG,POL PL,POR PT,PUR PR,
QAT QA,ROU RO,RSA ZA,RUS RU,RWA RW,SEN SN,SEY SC,SGP SG,SKN KN,SLE SL,SLO SI,SMR SM,SOL SB,SOM SO,SRB RS,
SRI LK,SSD SS,STP ST,SUD SD,SUI CH,SUR SR,SVK SK,SWE SE,SWZ SZ,SYR SY,TAN TZ,THA TH,TJK TJ,TKM TM,TLS TL,
TOG TG,TTO TT,TUN TN,TUR TR,UAE AE,UGA UG,UKR UA,URU UY,USA US,UZB UZ,VAN VU,VEN VE,VIE VN,VIN VC,YEM YE,
ZAM ZM,ZIM ZW
`;

export interface Federation {
  code: string;
  region?: string;
  /** Own names, for federations without a plain region name. */
  names?: { en: string; fi: string };
}

const special: Federation[] = [
  { code: 'ENG', names: { en: 'England', fi: 'Englanti' } },
  { code: 'SCO', names: { en: 'Scotland', fi: 'Skotlanti' } },
  { code: 'WLS', names: { en: 'Wales', fi: 'Wales' } },
  { code: 'TPE', names: { en: 'Chinese Taipei', fi: 'Kiinan Taipei' } },
  { code: 'FID', names: { en: 'FIDE (no federation)', fi: 'FIDE (ei liittoa)' } },
];

export const federations: readonly Federation[] = [
  ...RAW.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [code, region] = s.split(/\s+/);
      return { code, region };
    }),
  ...special,
];

const codes = new Set(federations.map((f) => f.code));

/** Players representing these federations cannot play in tournaments organised in Finland (decision of the Finnish Chess Federation). */
export const blockedFederations: readonly string[] = ['RUS', 'BLR'];

export function isBlockedFederation(code: unknown): boolean {
  return typeof code === 'string' && blockedFederations.includes(code.toUpperCase());
}

export function isFederation(code: unknown): code is string {
  return typeof code === 'string' && codes.has(code);
}

/** Federations sorted by their name in the given language. */
export function federationOptions(lang: 'en' | 'fi'): { code: string; label: string }[] {
  const names = new Intl.DisplayNames([lang], { type: 'region' });
  return federations
    .filter((f) => !blockedFederations.includes(f.code))
    .map((f) => ({ code: f.code, label: f.names ? f.names[lang] : (f.region && names.of(f.region)) || f.code }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));
}
