import type { RoleTemplate } from './types'

/**
 * Product (APM / PM) — built from the "SK_JD Associate Product Manager" JD
 * (March '26). Content is generalised so it works for any product team; the
 * company specifics live in the role, not the template.
 *
 * Budget and experience are deliberately left for HR to enter per role.
 */
export const productApm: RoleTemplate = {
  id: 'product-apm',
  name: 'Product — Associate Product Manager',
  family: 'Product',
  description: 'Entry-level product role: execution, data, research and AI-assisted workflows.',
  spec: {
    basics: {
      title: 'Associate Product Manager',
      team: 'Product',
      level: 'entry',
      employmentType: 'full_time',
      workMode: 'remote',
      city: '',
    },
    opportunity:
      'Work alongside the product team to define, ship and measure features in a consumer app. You will own data pulls, research and documentation, and use AI tools daily to move faster.',
    responsibilities: [
      {
        theme: 'Product execution',
        bullets: [
          'Define, refine and document requirements for features going live in the app.',
          'Use AI tools to produce wireframes, user flows and clear PRDs for design and engineering.',
          'Coordinate with engineering and design so features ship on time and as specified.',
        ],
      },
      {
        theme: 'Data and research',
        bullets: [
          'Pull data with SQL, build dashboards and analyse user funnels to inform decisions.',
          'Run qualitative and quantitative research and competitive analysis, and turn findings into recommendations.',
          'Track DAU, MAU, retention and engagement, and flag anomalies or opportunities early.',
        ],
      },
      {
        theme: 'Stakeholders and AI-powered execution',
        bullets: [
          'Triage, document and prioritise requests from sales, content and marketing with the product team.',
          'Find repetitive work in the product workflow and replace it with AI-based solutions.',
        ],
      },
    ],
    mustHaves: [
      {
        id: 'sql',
        name: 'SQL',
        description: 'Writes accurate queries quickly to answer product questions (joins, aggregations, funnels).',
        importance: 'high',
        // No screening question tests SQL, so it is checked where it can be seen
        assessedBy: ['resume', 'interview'],
      },
      {
        id: 'python',
        name: 'Python for data tasks',
        description: 'Uses Python for data processing, automation or scripting.',
        importance: 'medium',
        assessedBy: ['resume', 'interview'],
      },
      {
        id: 'ai-native',
        name: 'AI-native working',
        description: 'Uses AI tools daily, picks the right tool for the job, and verifies the output.',
        importance: 'high',
        assessedBy: ['screening', 'interview'],
      },
      {
        id: 'product-sense',
        name: 'Product sense',
        description: 'Understands user problems, validates before building, and weighs impact against effort.',
        importance: 'high',
        assessedBy: ['screening', 'interview'],
      },
      {
        id: 'communication',
        name: 'Clear communication',
        description: 'Explains reasoning and influences stakeholders with clarity and evidence.',
        importance: 'medium',
        assessedBy: ['screening', 'interview'],
      },
      {
        id: 'ownership',
        name: 'Ownership and prioritisation',
        description: 'Organises own time, prioritises by urgency and impact, flags blockers early.',
        importance: 'high',
        assessedBy: ['screening'],
      },
    ],
    goodToHaves: [
      {
        id: 'growth',
        name: 'Mobile funnels and engagement',
        description: 'Understands app funnels, growth loops and engagement mechanics.',
        importance: 'low',
        assessedBy: ['screening', 'resume'],
      },
      {
        id: 'llm-automation',
        name: 'Built AI automations',
        description: 'Has built prompts, workflows or automations with AI agents or LLM APIs.',
        importance: 'low',
        assessedBy: ['resume'],
      },
    ],
    screeningQuestions: [
      {
        id: 'q-priorities',
        text: 'It is 4:00 PM and you get 3 priority tasks: investigate a sudden spike in app uninstalls, draft a PRD for a new trivia feature, and define mutually exclusive user segments for an upcoming funnel analysis report. You only have time to properly complete one before logging off. How do you handle this?',
        wordLimit: 100,
        skillIds: ['ownership', 'product-sense'],
        importance: 'high',
        rubric: {
          1: 'Picks a task with no reasoning, or tries to do all three. Ignores that an uninstall spike may be an active incident.',
          3: 'Picks the uninstall spike because it is urgent, but does not say how the other two tasks are handled or communicated.',
          5: 'Investigates the uninstall spike first as a possible live issue (checks recent release, crash data, affected segment), explicitly defers the PRD and segments, and tells stakeholders what moves and when.',
        },
      },
      {
        id: 'q-validate-demand',
        text: 'A vocal group of users on social media is demanding a "live fan chat" feature during matches. It sounds exciting, but it has not been built. How do you figure out whether this is actually a good idea for the app, or a noisy distraction?',
        wordLimit: 100,
        skillIds: ['product-sense', 'growth'],
        importance: 'high',
        rubric: {
          1: 'Builds it because users asked, or dismisses it without checking. No data or validation.',
          3: 'Suggests a survey or looking at some data, but does not separate the vocal minority from the broader user base or define success.',
          5: 'Sizes real demand beyond the vocal group (in-app behaviour, search or session data, a cheap fake-door or poll test), weighs moderation cost and strategic fit, and defines a measurable success threshold before committing engineering time.',
        },
      },
      {
        id: 'q-review-synthesis',
        text: 'You need to summarise 500 open-text user reviews from the app store and present the top three actionable feature requests to the team in one hour. How do you do it?',
        wordLimit: 100,
        skillIds: ['ai-native', 'communication'],
        importance: 'high',
        rubric: {
          1: 'Reads reviews manually or gives no method that fits in an hour.',
          3: 'Uses an AI tool to summarise the reviews, but does not mention checking the output or how the top three are chosen.',
          5: 'Uses an AI tool to cluster reviews into themes, ranks by frequency and impact, spot-checks the clusters against real reviews to catch hallucinations, and presents three requests with counts and example quotes.',
        },
      },
      {
        id: 'q-no-bandwidth',
        text: 'You have a major feature idea, but there is zero engineering bandwidth for the next two weeks. What exactly do you do during this time?',
        wordLimit: 100,
        skillIds: ['ownership', 'product-sense'],
        importance: 'medium',
        rubric: {
          1: 'Waits for bandwidth, or tries to pull engineers off their work.',
          3: 'Writes a PRD or does some research, without a clear plan for what is validated by the end of two weeks.',
          5: 'Uses the two weeks to de-risk the idea: validates the problem with users and data, prototypes or wireframes it with AI tools, defines success metrics, and lines up stakeholders so it is ready to build the day bandwidth frees up.',
        },
      },
      {
        id: 'q-stakeholder',
        text: 'You strongly believe a new engagement feature must go live before a major tournament, but a senior stakeholder completely disagrees on its priority. How do you proceed?',
        wordLimit: 100,
        skillIds: ['communication', 'product-sense'],
        importance: 'medium',
        rubric: {
          1: 'Escalates immediately, gives in without discussion, or pushes ahead regardless.',
          3: 'Proposes a meeting to discuss, but brings no evidence or alternative.',
          5: 'Seeks to understand the stakeholder\'s reasoning first, makes the case with data on the tournament opportunity and cost of delay, offers a smaller-scope or phased alternative, and agrees on a decision and an owner.',
        },
      },
      {
        id: 'q-bots',
        text: 'A new leaderboard drives engagement, but within 3 days the top 10 positions are clearly held by bots or spam accounts farming points. Engineering bandwidth is zero. How do you handle this right now to protect the real user experience?',
        wordLimit: 100,
        skillIds: ['product-sense', 'ownership'],
        importance: 'medium',
        rubric: {
          1: 'Waits for engineering, or ignores the problem.',
          3: 'Suggests manually removing the accounts, without addressing recurrence or communication with users.',
          5: 'Acts with no-code levers now (hide or freeze the leaderboard, manual or admin-panel removal, rule or config changes), communicates transparently with real users, documents the abuse pattern, and queues a lasting fix for when bandwidth returns.',
        },
      },
      {
        id: 'q-competitor',
        text: 'A major competitor just launched a heavily marketed AI stats feature. Leadership asks whether you should build a clone immediately so you do not fall behind. How do you evaluate whether this is actually the right move?',
        wordLimit: 100,
        skillIds: ['product-sense', 'ai-native'],
        importance: 'medium',
        rubric: {
          1: 'Agrees to clone it immediately, or rejects it without analysis.',
          3: 'Mentions checking user needs or competitor results, without a structured evaluation.',
          5: 'Checks whether the feature solves a real problem for this app\'s users, looks for evidence of its adoption, compares cost and opportunity against the roadmap, and proposes a differentiated or lean experiment instead of a blind clone.',
        },
      },
    ],
    screeningAdvance: { minScore: 70, maxAdvance: 25 },
    eligibility: {
      // Entered by HR for each role — a template carries no budget
      budget: { enabled: true, fixedLpa: 0, variableLpa: 0, compareAgainst: 'total', tolerancePct: 20, action: 'exclude' },
      experience: { enabled: true, minYears: 0, maxYears: 2, tolerancePct: 20, action: 'exclude' },
      notice: { enabled: false, maxDays: 60, tolerancePct: 0, action: 'exclude' },
      location: { enabled: false, allowed: [], action: 'exclude' },
    },
    preferredColleges: [],
    preferredCollegeBonus: 0,
    interviewRounds: [
      {
        kind: 'ai',
        id: 'ai-1',
        name: 'AI round 1 — skills deep-dive',
        maxFollowUps: 1,
        deadlineHours: 72,
        reminderHoursBefore: 24,
        advance: { minScore: 70, maxAdvance: 10 },
        questions: [
          {
            id: 'i-sql',
            text: 'Walk me through a SQL query you wrote recently to answer a product question. Which tables did you use, how did you join and filter them, and what did the result change?',
            skillIds: ['sql'],
            timeLimitSec: 150,
            rubric: {
              1: 'Cannot describe a real query, or speaks only in generalities about SQL.',
              3: 'Describes a real query with basic joins or filters, but the product decision it informed is vague.',
              5: 'Describes a specific query (tables, join keys, filters, aggregation, edge cases like duplicates or time windows) and the concrete decision or metric it changed.',
            },
          },
          {
            id: 'i-python',
            text: 'Tell me about something you automated with Python or a script. What was being done manually before, and what did your automation save?',
            skillIds: ['python', 'ownership'],
            timeLimitSec: 150,
            rubric: {
              1: 'No real example of using Python or scripting.',
              3: 'A real but small script, with unclear impact.',
              5: 'A concrete automation: what it replaced, how it worked (libraries, data flow), and measurable time or error savings.',
            },
          },
          {
            id: 'i-ai-workflow',
            text: 'Which AI tools do you use every day, and for what? Describe one workflow where AI changed the quality of your output, not just the speed.',
            skillIds: ['ai-native', 'communication'],
            timeLimitSec: 120,
            rubric: {
              1: 'Mentions ChatGPT generically with no real workflow.',
              3: 'Uses a few tools for common tasks, but cannot explain how the output is checked or improved.',
              5: 'Names specific tools for specific jobs, describes a real workflow in detail, and explains how they verify AI output and when they choose not to use AI.',
            },
          },
          {
            id: 'i-metric-drop',
            text: 'Daily active users dropped 15% week over week. Walk me through what you would do in your first hour.',
            skillIds: ['product-sense', 'sql'],
            timeLimitSec: 150,
            rubric: {
              1: 'Jumps to a fix or guesses a cause without investigating.',
              3: 'Checks data in a reasonable order, but misses obvious first checks like tracking issues or releases.',
              5: 'First rules out data or tracking errors, then segments the drop (platform, version, geography, acquisition channel), checks recent releases and external events, forms hypotheses, and says who they would inform and when.',
            },
          },
        ],
      },
      {
        kind: 'human',
        id: 'hm-final',
        name: 'Final round with the hiring manager',
        interviewerEmails: [],
        durationMin: 45,
      },
    ],
  },
  changeNotes: [
    {
      section: 'Basics',
      change: 'Company name, the CricRocket app name and "Remote" were moved out of the template into the role.',
      why: 'A template should work for any product team; company specifics belong to the role created from it.',
    },
    {
      section: 'Responsibilities',
      change: 'The JD\'s 4 sections and 13 bullets became 3 themes and 8 bullets. Duplicate AI bullets were merged.',
      why: 'The structure allows 3–8 bullets so the JD stays scannable and the scorer gets a clear picture of the work.',
    },
    {
      section: 'Must-haves',
      change: 'The JD\'s 6 must-haves were kept. "Excellent written communication" became "Clear communication", and "highly organised and proactive" became "Ownership and prioritisation".',
      why: 'Each must-have needs a name the AI can score consistently and a place where it is assessed.',
    },
    {
      section: 'Must-haves',
      change: 'SQL and Python are assessed from the resume and the AI interview, not from screening answers.',
      why: 'None of the 7 screening questions asks about SQL or Python, so screening answers could never show them. Every candidate would score the same on 2 of the 6 must-haves.',
    },
    {
      section: 'Screening questions',
      change: 'All 7 questions were kept and generalised ("CricRocket" became "the app"). Each is linked to 1–2 skills and has an answer key for scores 1, 3 and 5. "(Do not write more than 100 words)" became a 100-word limit setting.',
      why: 'Answer keys make the AI score every candidate against the same standard instead of its own judgement.',
    },
    {
      section: 'Eligibility',
      change: 'Experience is set to 0–2 years with 20% tolerance, from the JD. Budget is left blank for HR to enter; for the March \'26 role that is 10 L fixed + 1 L variable.',
      why: 'Pay differs by role and company, so the template never carries a budget.',
    },
    {
      section: 'Interview plan',
      change: 'Added: one AI round with 4 questions (SQL, Python, AI workflow, metric drop), then a final round with the hiring manager.',
      why: 'The JD had no interview plan. The AI round covers the must-haves that screening cannot reach (SQL, Python) before the hiring manager spends time.',
    },
  ],
}
