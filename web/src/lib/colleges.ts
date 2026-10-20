/**
 * Preferred-college matching. HR types short forms ("IIM", "BITS", "IIT
 * Delhi"); candidates type anything ("Indian Institute of Management,
 * Kozhikode", "BITS PILANI K.K.BIRLA CAMPUS", "IIM-K"). Both sides are
 * expanded to full names first, then every meaningful word of the preferred
 * entry must appear in the candidate's college.
 */

const ALIASES: [RegExp, string][] = [
  [/\biims?\b/g, 'indian institute of management'],
  [/\biits?\b/g, 'indian institute of technology'],
  [/\biiits?\b/g, 'indian institute of information technology'],
  [/\bnits?\b/g, 'national institute of technology'],
  [/\biisc\b/g, 'indian institute of science'],
  [/\biiser\b/g, 'indian institute of science education and research'],
  [/\bbits\b/g, 'birla institute of technology and science'],
  [/\bdtu\b/g, 'delhi technological university'],
  [/\bnsut\b|\bnsit\b/g, 'netaji subhas university of technology'],
  [/\bvjti\b/g, 'veermata jijabai technological institute'],
  [/\bcoep\b/g, 'college of engineering pune'],
  [/\brvce\b/g, 'rv college of engineering'],
  [/\bdaiict\b|\bda-iict\b/g, 'dhirubhai ambani institute of information and communication technology'],
  [/\bxlri\b/g, 'xavier school of management'],
  [/\bximb\b/g, 'xavier institute of management bhubaneswar'],
  [/\bisb\b/g, 'indian school of business'],
  [/\bfms\b/g, 'faculty of management studies'],
  [/\bmdi\b/g, 'management development institute'],
  [/\bspjimr\b/g, 'sp jain institute of management and research'],
  [/\bnmims\b/g, 'narsee monjee institute of management studies'],
  [/\bsibm\b/g, 'symbiosis institute of business management'],
  [/\bscit\b/g, 'symbiosis centre for information technology'],
  [/\bimt\b/g, 'institute of management technology'],
  [/\bimi\b/g, 'international management institute'],
  [/\btapmi\b/g, 't a pai management institute'],
  [/\bgim\b/g, 'goa institute of management'],
  [/\bdu\b/g, 'delhi university'],
  [/\bvit\b/g, 'vellore institute of technology'],
  [/\bsrm\b/g, 'srm institute of science and technology'],
]

// Campus suffixes typed onto acronyms: "IIM-A", "IIMA", "IIT-B"
const CAMPUS_CODES: Record<string, string> = {
  iima: 'iim ahmedabad', iimb: 'iim bangalore', iimc: 'iim calcutta', iiml: 'iim lucknow', iimk: 'iim kozhikode', iimi: 'iim indore',
  iitb: 'iit bombay', iitd: 'iit delhi', iitk: 'iit kanpur', iitm: 'iit madras', iitkgp: 'iit kharagpur', iitr: 'iit roorkee', iitg: 'iit guwahati',
}

export function normaliseCollege(raw: string): string {
  let s = ` ${raw.toLowerCase().replace(/[.,()&/:;|]/g, ' ').replace(/[-–]/g, ' ')} `
  s = s.replace(/\s+/g, ' ')
  // "iim a" / "iim-a" / "iima" → "iim ahmedabad"
  s = s.replace(/\b(iim|iit)\s?([a-z]{1,3})\b/g, (m, a, b) => CAMPUS_CODES[a + b] ?? m)
  for (const [re, full] of ALIASES) s = s.replace(re, full)
  s = s.replace(/\bbangalore\b/g, 'bengaluru').replace(/\bbombay\b/g, 'mumbai').replace(/\bcalcutta\b/g, 'kolkata').replace(/\bmadras\b/g, 'chennai')
  // "Indian Institute of Technology (IIT) Delhi" → drop the repeated expansion
  s = s.replace(/\b((?:\w+ ){2,6}\w+) \1\b/g, '$1')
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * The preferred entries this college matches, e.g. ["IIM"]. The expanded
 * preferred name must appear as a whole phrase: matching word-by-word would
 * let "IIIT Delhi" (Indian Institute of *Information* Technology Delhi)
 * satisfy "IIT Delhi".
 */
export function matchPreferredColleges(college: string | undefined, preferred: string[]): string[] {
  if (!college?.trim()) return []
  const c = ` ${normaliseCollege(college)} `
  return preferred.filter(p => {
    const need = normaliseCollege(p)
    return need.length > 1 && c.includes(` ${need} `)
  })
}
