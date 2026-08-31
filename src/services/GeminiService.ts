import Groq from 'groq-sdk';
import { aiResponseSchema, projectEstimateAiSchema } from './schema';
import {
  ClientType,
  NegotiationPosture,
  ProjectValueRange,
} from '@prisma/client';

export interface ProjectEstimateBlock {
  low: number;
  recommended: number;
  high: number;
  context: string;
}

export interface ProjectEstimateAiResult {
  localEstimate: ProjectEstimateBlock;
  internationalEstimate: ProjectEstimateBlock;
  confidence: number;
  projectType: string;
  reasoning: string[];
  localBreakdown: {
    label: string;
    percentOfTotal: number;
    hours: number;
    rate: number;
    total: number;
  }[];
  internationalBreakdown: {
    label: string;
    percentOfTotal: number;
    hours: number;
    rate: number;
    total: number;
  }[];
  localTotalHours: number;
  internationalTotalHours: number;
  suggestedPrice: number;
  analyzedKeywords: string[];
}

export interface SkillProfile {
  yearsOfExperience: number | null;
  toolsAndSkills: string[];
  clientTypes: ClientType[];
  negotiationPosture: NegotiationPosture | null;
  averageProjectValue: ProjectValueRange | null;
  industry: string | null;
  experienceLevel: string | null;
}

export interface RateBlock {
  min: number;
  median: number;
  max: number;
  context: string;
}

export interface PushBackScript {
  objection: string;
  response: string;
}

export interface NegotiationBrief {
  positioning: string;
  howToPresent: string;
  pushBack: PushBackScript[];
  holdFirmWhen: string[];
  acceptLowerWhen: string[];
  redFlags: string[];
}

export interface RateAIInsights {
  message: string;
  suggestedRate: number;
  confidence: number;
  reasoning: string;
  negotiationTips: string[];
  localRate: RateBlock;
  internationalRate: RateBlock;
  isUndercharging: boolean;
  percentBelow: number;
  annualGap: number;
  negotiationBrief: NegotiationBrief;
}

let groqClient: Groq | null = null;

function getClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('[groq] GROQ_API_KEY is not set in this environment');
      throw new Error('GROQ_API_KEY is not set');
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

function assertEstimateOrder(block: ProjectEstimateBlock, label: string): void {
  if (!(block.low < block.recommended && block.recommended < block.high)) {
    throw new Error(
      `AI returned illogical ${label}: low=${block.low}, recommended=${block.recommended}, high=${block.high}`,
    );
  }
}

function assertRateOrder(block: RateBlock, label: string): void {
  if (!(block.min < block.median && block.median < block.max)) {
    throw new Error(
      `AI returned illogical ${label}: min=${block.min}, median=${block.median}, max=${block.max}`,
    );
  }
}
/**
 * Analyze a freelancer's hourly rate against market data.
 * Returns structured JSON matching the existing analyzeUndercharging response shape.
 */
export async function analyzeRateWithAI(params: {
  role: string;
  subcategory?: string;
  experienceLevel: string;
  currentRate: number;
  marketMin: number;
  marketMax: number;
  marketMedian: number;
  marketAverage: number;
  sampleSize: number;
  freelancerLocation: string;
  clientMarket?: string;
  profile?: SkillProfile | null;
}): Promise<RateAIInsights> {
  const {
    role,
    subcategory,
    experienceLevel,
    currentRate,
    marketMin,
    marketMax,
    marketMedian,
    marketAverage,
    sampleSize,
    freelancerLocation,
    clientMarket,
    profile,
  } = params;

  const PROJECT_VALUE_TEXT: Record<ProjectValueRange, string> = {
    UNDER_500: 'under $500',
    FROM_500_TO_2K: '$500–$2,000',
    FROM_2K_TO_5K: '$2,000–$5,000',
    FROM_5K_TO_15K: '$5,000–$15,000',
    OVER_15K: 'over $15,000',
  };

  const POSTURE_TEXT: Record<NegotiationPosture, string> = {
    NEED_EVERY_JOB: 'needs every job — little room to decline offers',
    SELECTIVE: 'somewhat selective — can occasionally decline poor offers',
    CAN_DECLINE: 'healthy pipeline — can confidently walk away from bad offers',
  };

  const profileLines: string[] = [];
  if (profile?.yearsOfExperience != null)
    profileLines.push(`- Years of experience: ${profile.yearsOfExperience}`);
  if (profile?.toolsAndSkills?.length)
    profileLines.push(`- Tools & skills: ${profile.toolsAndSkills.join(', ')}`);
  if (profile?.clientTypes?.length)
    profileLines.push(
      `- Typical clients: ${profile.clientTypes.join(', ').toLowerCase()}`,
    );
  if (profile?.averageProjectValue)
    profileLines.push(
      `- Typical project value: ${
        PROJECT_VALUE_TEXT[profile.averageProjectValue]
      }`,
    );
  if (profile?.negotiationPosture)
    profileLines.push(
      `- Negotiation position: ${POSTURE_TEXT[profile.negotiationPosture]}`,
    );

  const profileSection = profileLines.length
    ? `\nEXTENDED PROFILE (from the freelancer's saved account data):\n${profileLines.join(
        '\n',
      )}\n`
    : '';

  const market = clientMarket ?? 'BOTH';
  const specificRole = subcategory?.trim() || role;

  const prompt = `
You are a senior freelance business advisor with deep knowledge of
global market rates. Analyze this freelancer's rate and provide
specific, actionable guidance.

FREELANCER PROFILE:
- Role: ${specificRole}
- Experience level: ${experienceLevel}
- Current rate: $${currentRate}/hr (USD)
- Based in: ${freelancerLocation}
- Client market focus: ${market}

${profileSection}


INTERNAL REFERENCE DATA (not location-specific- use only as a rough sanity check, and prioritize your own market knowledge):
- min $${marketMin}/hr, median $${marketMedian}/hr, max $${marketMax}/hr, average $${marketAverage}/hr
 (${sampleSize}+ points)

 ANALYSIS RULES:
 1. localRate = what client located in ${freelancerLocation} typically pay for this role and experience level, reflecting that local economy.
 2. internationalRate = what US/EU/remote-first clients typically pay a remote freelancer with this profile, regardless of where they live.
 3. These two markets may be nearly identical (freelancer already in high-cost market) or far apart. Reflect economic reality; do not assume either direction.
 4. All rates in USD per hour. In each block, min < median < max.
 5. suggestedRate must follow the client market focus "${market}":
    LOCAL -> within localRate range; INTERNATIONAL -> within international range; BOTH -> lean towards internationalRate, with localRate median as the floor
 6. Be specific with dollar amounts. Never say "it depends". 
 7. If an EXTENDED PROFILE is provided, weigh it heavily: negotiation
   posture must shape the negotiationTips (someone who can decline
   gets bolder scripts than someone who needs every job); specialized
   tools and repeat client types justify premium positioning. 
8. negotiationBrief is a script the freelancer reads before a client call.
    Write every line in FIRST PERSON, ready to say out loud — "My rate for
    this kind of work is $X/hr" — never "the freelancer should explain".
    Anchor howToPresent and every pushBack response to the actual
    suggestedRate of $${'${value.suggestedRate}'} ... (see note below)
    Objections must be things clients really say ("that's above our budget",
    "we can get this cheaper", "can you do a lower rate for ongoing work").
    Negotiation posture governs firmness: CAN_DECLINE gets walk-away lines;
    SELECTIVE gets confident-but-flexible lines; NEED_EVERY_JOB gets
    face-saving trades (reduce scope, phase the work, adjust deliverables)
    rather than simply dropping the rate.
    Produce exactly 3 pushBack pairs, 2-3 holdFirmWhen, 2-3 acceptLowerWhen,
    and 3 redFlags. holdFirmWhen and acceptLowerWhen must describe concrete, observable
    situations tied to this freelancer's profile and rate — not generic
    advice like "the project is complex". redFlags must be behaviours
    observable DURING the conversation (evasive about budget, pressure to
    start before terms are agreed, scope growing while price stays fixed) —
    never things the freelancer cannot know, like payment history.

Respond ONLY with a valid JSON object. No markdown fence, no text explanation outside JSON - exactly this structure:

{
  "message": "2-3 sentence direct assessment of their current rate",
  "suggestedRate": <number>,
  "confidence": <number 0-100>,
  "reasoning": "2-3 sentences explaining the recommendation with specific numbers",
  "negotiationTips": [
    "Specific tip 1 with exact numbers or scripts",
    "Specific tip 2",
    "Specific tip 3"
  ],
  "localRate": ${`{
    "min": <number>,
    "median": <number>,
    "max": <number>,
    "context": "1 sentence on the ${freelancerLocation} market"
  }`},
  "internationalRate": ${`{
    "min": <number>,
    "median": <number>,
    "max": <number>,
    "context": "1 sentence about international opportunity"
  }`},
  "negotiationBrief": {
    "positioning": "1-2 sentences, spoken in first person, on how to frame your expertise before price comes up",
    "howToPresent": "2-3 sentences — the exact words to say when stating your rate, including the $ number",
    "pushBack": [
      { "objection": "the exact words a client says to push back", "response": "the exact words to say back, in first person" },
      { "objection": "...", "response": "..." },
      { "objection": "...", "response": "..." }
    ],
    "holdFirmWhen": ["specific situation where you should not lower the rate", "another"],
    "acceptLowerWhen": ["specific situation where a lower rate is a smart trade", "another"],
    "redFlags": ["concrete client behaviour that signals trouble", "another", "another"]
  }
}
`;

  try {
    const completion = await getClient().chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const { error, value } = aiResponseSchema.validate(parsed, {
      stripUnknown: true,
    });
    if (error)
      throw new Error(`AI response failed validation: ${error.message}`);

    assertRateOrder(value.localRate, 'localRate');
    assertRateOrder(value.internationalRate, 'internationalRate');

    const benchMark =
      market === 'LOCAL'
        ? value.localRate.median
        : value.internationalRate.median;

    const isUndercharging = currentRate < benchMark;
    const percentBelow = isUndercharging
      ? Math.round(((benchMark - currentRate) / benchMark) * 100)
      : 0;

    const BILLABLE_HOUR_PER_YEAR = 30 * 48;
    const annualGap = isUndercharging
      ? Math.round((value.suggestedRate - currentRate) * BILLABLE_HOUR_PER_YEAR)
      : 0;
    return { ...value, isUndercharging, percentBelow, annualGap };
  } catch (err) {
    console.error('[pricing/ai] analyzeRateWithAI failed:', {
      role,
      freelancerLocation,
      market,
      error: err instanceof Error ? err.message : err,
    });
    throw err;
  }
}

/**
 * Estimate a project's value using AI analysis of the description.
 * Returns structured JSON matching the existing ProjectEstimate shape.
 */
export async function estimateProjectWithAI(params: {
  description: string;
  projectType: string;
  freelancerLocation: string;
  clientMarket: string;
}): Promise<ProjectEstimateAiResult> {
  const { description, projectType, freelancerLocation, clientMarket } = params;
  const prompt = `
You are a senior freelance pricing consultant. A freelancer wants to estimate the value of a project.

Project description: "${description}"
Pricing model: ${projectType} (FIXED or HOURLY)

Freelancer location: ${freelancerLocation}
Client market focus: ${clientMarket}

Provide TWO estimates:
- localEstimate: what clients based in ${freelancerLocation} would typically pay for this project, reflecting that local economy.
- internationalEstimate: what US/EU/remote-first clients would typically pay for this project, regardless of freelancer location.
These may be similar or far apart — reflect economic reality, do not assume either direction.

Analyze this project and provide a realistic market-rate estimate. Consider:
- Project complexity based on the description
- Typical freelance market rates (USD)
- Reasonable scope and deliverables implied
- Common hourly rates: designers $75-150/hr, developers $85-175/hr, writers $50-100/hr, marketers $60-120/hr, generalists $60-110/hr

Respond ONLY with a JSON object. No markdown, no backticks, no explanation outside the JSON.

{
  "localEstimate": { "low": <int>, "recommended": <int>, "high": <int>, "context": "<1 sentence on the local market>" },
"internationalEstimate": { "low": <int>, "recommended": <int>, "high": <int>, "context": "<1 sentence on the international opportunity>" },
  "confidence": <integer 70-95>,
  "projectType": "<detected project category: brand/website/app/content/social/video/marketing/development/general>",
  "reasoning": [
    "<insight about pricing this type of project>",
    "<specific observation about this description>",
    "<tactical advice for proposing this project>"
  ],
  "breakdown": [
    { "label": "<phase name>", "percentOfTotal": <integer 5-60> },
    { "label": "<phase name>", "percentOfTotal": <integer 5-60> },
    { "label": "<phase name>", "percentOfTotal": <integer 5-60> },
    { "label": "<phase name>", "percentOfTotal": <integer 5-60> }
  ]
  "analyzedKeywords": ["<keyword1>", "<keyword2>", "<keyword3>"]
}

The 4 percentOfTotal values must sum to exactly 100.
`;

  try {
    const completion = await getClient().chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_tokens: 2048,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const { error, value } = projectEstimateAiSchema.validate(parsed, {
      stripUnknown: true,
    });
    if (error)
      throw new Error(`AI response failed validation: ${error.message}`);

    assertEstimateOrder(value.localEstimate, 'localEstimate');
    assertEstimateOrder(value.internationalEstimate, 'internationalEstimate');

    function buildBreakdown(
      target: ProjectEstimateBlock,
      proportions: { label: string; percentOfTotal: number }[],
    ) {
      const rate = Math.round(target.recommended / 40);
      const breakdown = proportions.map((item) => {
        const total = Math.round(
          (item.percentOfTotal / 100) * target.recommended,
        );
        const hours = Math.round(total / rate) || 1;
        return { ...item, hours, rate, total };
      });
      const totalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);
      return { breakdown, totalHours };
    }

    const localBreakdown = buildBreakdown(value.localEstimate, value.breakdown);
    const internationalBreakdown = buildBreakdown(
      value.internationalEstimate,
      value.breakdown,
    );

    const suggestedPrice =
      clientMarket === 'LOCAL'
        ? value.localEstimate.recommended
        : clientMarket === 'INTERNATIONAL'
          ? value.internationalEstimate.recommended
          : Math.round(
              (value.localEstimate.recommended +
                value.internationalEstimate.recommended) /
                2,
            );

    value.localBreakdown = localBreakdown.breakdown;
    value.internationalBreakdown = internationalBreakdown.breakdown;
    value.localTotalHours = localBreakdown.totalHours;
    value.internationalTotalHours = internationalBreakdown.totalHours;
    value.suggestedPrice = suggestedPrice;

    delete value.breakdown;
    delete value.totalHours;

    return value;
  } catch (err) {
    console.error('[pricing/ai] estimateProjectWithAi failed:', {
      freelancerLocation,
      clientMarket,
      error: err instanceof Error ? err.message : err,
    });
    throw err;
  }
}

/**
 * Generate personalized pricing recommendations using AI.
 */
export async function generateRecommendationsWithAI(params: {
  currentRate: number;
  marketMedian: number;
  experienceLevel: string;
  category: string;
  invoiceCount: number;
}): Promise<
  Array<{
    type: string;
    title: string;
    description: string;
    impact: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>
> {
  const annualHours = 40 * 48;
  const potentialIncrease = Math.round(
    (params.marketMedian - params.currentRate) * annualHours,
  );

  const prompt = `
You are a senior freelance business advisor. Generate actionable pricing recommendations for a freelancer.

Their profile:
- Category: ${params.category}
- Experience Level: ${params.experienceLevel}
- Current average rate: $${params.currentRate}/hr
- Market median for their role: $${params.marketMedian}/hr
- Invoices sent so far: ${params.invoiceCount}
- Potential annual increase if at market rate: $${potentialIncrease.toLocaleString()}

Generate exactly 5 recommendations. Respond ONLY with a JSON array. No markdown, no backticks.

[
  {
    "type": "RATE_INCREASE",
    "title": "<short title>",
    "description": "<2 sentences, specific to their numbers>",
    "impact": "<specific dollar or percentage impact>",
    "priority": "HIGH"
  },
  {
    "type": "POSITIONING",
    "title": "<short title>",
    "description": "<2 sentences about positioning/niche>",
    "impact": "<business impact>",
    "priority": "HIGH"
  },
  {
    "type": "PRICING_MODEL",
    "title": "<short title>",
    "description": "<2 sentences about pricing strategy>",
    "impact": "<revenue impact>",
    "priority": "MEDIUM"
  },
  {
    "type": "MINIMUM_PROJECT",
    "title": "<short title>",
    "description": "<2 sentences about minimum rates>",
    "impact": "<efficiency impact>",
    "priority": "MEDIUM"
  },
  {
    "type": "ANNUAL_REVIEW",
    "title": "<short title>",
    "description": "<2 sentences about rate review cadence>",
    "impact": "<long term impact>",
    "priority": "LOW"
  }
]
`;

  try {
    const completion = await getClient().chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    throw err;
  }
}

/**
 * Generate personalized pricing insights from real user data.
 * Returns 4-6 actionable insight cards with specific numbers.
 */
export async function generatePricingInsightsWithAI(context: {
  category: string;
  experienceLevel: string;
  avgRate: number;
  marketMedian: number;
  marketMin: number;
  marketMax: number;
  totalInvoices: number;
  totalRevenue: number;
  avgDaysToPay: number;
  overdueRate: number;
  revenueGrowth: number;
  topClientRevenuePct: number;
  totalExpenses: number;
  expenseToRevenueRatio: number;
}): Promise<
  Array<{
    id: string;
    type: 'warning' | 'opportunity' | 'positive' | 'tip';
    title: string;
    description: string;
    impact: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>
> {
  const _isUndercharging =
    context.avgRate > 0 && context.avgRate < context.marketMedian;
  const rateDelta = context.marketMedian - context.avgRate;
  const _annualGap = Math.round(rateDelta * 40 * 48);

  const prompt = `
You are a senior freelance business analyst. Generate personalized pricing insights for a freelancer based on their REAL business data. Be specific, direct, and use the exact numbers provided.

FREELANCER'S ACTUAL DATA:
- Skill category: ${context.category}
- Experience level: ${context.experienceLevel}
- Their average rate: $${context.avgRate}/hr
- Market median for their role: $${context.marketMedian}/hr (range: $${
    context.marketMin
  }–$${context.marketMax}/hr)
- Total invoices issued: ${context.totalInvoices}
- Total revenue to date: $${context.totalRevenue.toLocaleString()}
- Average days to get paid: ${
    context.avgDaysToPay
  } days (industry standard: 14 days)
- Overdue invoice rate: ${context.overdueRate}% of invoices
- Revenue growth (last 3 months vs prior 3 months): ${
    context.revenueGrowth > 0 ? '+' : ''
  }${context.revenueGrowth}%
- Top client revenue concentration: ${
    context.topClientRevenuePct
  }% of total revenue from one client
- Total expenses: $${context.totalExpenses.toLocaleString()}
- Expense-to-revenue ratio: ${context.expenseToRevenueRatio}%

RULES:
- Generate exactly 5 insight cards
- Every card MUST reference specific numbers from the data above — no generic advice
- type must be one of: "warning" (problem), "opportunity" (upside), "positive" (strength), "tip" (strategy)
- priority must be: "HIGH" for issues costing money now, "MEDIUM" for important improvements, "LOW" for long-term
- title: max 6 words, punchy
- description: 2 sentences max, specific numbers required
- impact: one line, quantified where possible

Prioritize insights in this order:
1. Rate gap (if undercharging by >15%)
2. Payment collection speed (if >21 days)
3. Client concentration risk (if >60% from one client)
4. Overdue rate (if >20%)
5. Revenue trend (growing or declining)
6. Expense ratio (if >30%)

Respond ONLY with a JSON array. No markdown, no backticks, no explanation outside the JSON.

[
  {
    "id": "insight_1",
    "type": "warning|opportunity|positive|tip",
    "title": "<max 6 words>",
    "description": "<2 sentences with specific numbers from their data>",
    "impact": "<quantified impact>",
    "priority": "HIGH|MEDIUM|LOW"
  }
]
`;

  try {
    const completion = await getClient().chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    // Ensure IDs are unique
    return parsed.map((item: Record<string, unknown>, i: number) => ({
      ...item,
      id: `insight_${i + 1}_${Date.now()}`,
    }));
  } catch (err) {
    throw err;
  }
}
