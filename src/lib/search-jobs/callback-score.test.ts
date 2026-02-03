import { describe, it, expect } from 'vitest';
import {
  estimateCallbackScore,
  isLargeCompany,
  isSmallCompany,
  isAggregatorUrl,
  isDirectApplyPlatform,
  detectSeniorityBoost,
} from './callback-score';

describe('isLargeCompany', () => {
  it('identifies FAANG companies', () => {
    expect(isLargeCompany('Google')).toBe(true);
    expect(isLargeCompany('Meta')).toBe(true);
    expect(isLargeCompany('Amazon')).toBe(true);
    expect(isLargeCompany('Apple Inc.')).toBe(true);
    expect(isLargeCompany('Microsoft')).toBe(true);
  });

  it('identifies other large companies', () => {
    expect(isLargeCompany('Walmart')).toBe(true);
    expect(isLargeCompany('JPMorgan Chase')).toBe(true);
    expect(isLargeCompany('Goldman Sachs')).toBe(true);
  });

  it('returns false for unknown companies', () => {
    expect(isLargeCompany('Acme Startup')).toBe(false);
    expect(isLargeCompany('Small Business LLC')).toBe(false);
  });
});

describe('isSmallCompany', () => {
  it('identifies startups by name indicators', () => {
    expect(isSmallCompany('TechCo Inc.')).toBe(true);
    expect(isSmallCompany('Stealth Startup')).toBe(true);
    expect(isSmallCompany('Series A Company LLC')).toBe(true);
  });

  it('returns false for companies without startup indicators', () => {
    expect(isSmallCompany('Google')).toBe(false);
    expect(isSmallCompany('Big Corporation')).toBe(false);
  });
});

describe('isAggregatorUrl', () => {
  it('identifies job board URLs', () => {
    expect(isAggregatorUrl('https://www.indeed.com/viewjob?jk=123')).toBe(true);
    expect(isAggregatorUrl('https://www.linkedin.com/jobs/view/123')).toBe(true);
    expect(isAggregatorUrl('https://www.glassdoor.com/job-listing/123')).toBe(true);
  });

  it('returns false for direct company URLs', () => {
    expect(isAggregatorUrl('https://acme.com/careers/engineer')).toBe(false);
    expect(isAggregatorUrl('https://boards.greenhouse.io/acme/jobs/123')).toBe(false);
  });
});

describe('isDirectApplyPlatform', () => {
  it('identifies ATS platforms', () => {
    expect(isDirectApplyPlatform('https://boards.greenhouse.io/acme/jobs/123')).toBe(true);
    expect(isDirectApplyPlatform('https://jobs.lever.co/acme/123')).toBe(true);
    expect(isDirectApplyPlatform('https://acme.wd5.myworkday.com/acme/job/123')).toBe(true);
  });

  it('returns false for job boards', () => {
    expect(isDirectApplyPlatform('https://www.indeed.com/viewjob?jk=123')).toBe(false);
  });
});

describe('detectSeniorityBoost', () => {
  it('gives highest boost to C-level', () => {
    expect(detectSeniorityBoost('CTO')).toBe(15);
    expect(detectSeniorityBoost('Chief Technology Officer')).toBe(15);
    expect(detectSeniorityBoost('VP of Engineering')).toBe(15);
  });

  it('gives high boost to directors', () => {
    expect(detectSeniorityBoost('Director of Engineering')).toBe(10);
    expect(detectSeniorityBoost('Engineering Director')).toBe(10);
  });

  it('gives moderate boost to senior roles', () => {
    expect(detectSeniorityBoost('Senior Software Engineer')).toBe(5);
    expect(detectSeniorityBoost('Staff Engineer')).toBe(5);
    expect(detectSeniorityBoost('Tech Lead')).toBe(5);
  });

  it('gives negative boost to entry level', () => {
    expect(detectSeniorityBoost('Junior Developer')).toBe(-5);
    expect(detectSeniorityBoost('Software Engineering Intern')).toBe(-5);
  });

  it('gives no boost to mid-level', () => {
    expect(detectSeniorityBoost('Software Engineer')).toBe(0);
    expect(detectSeniorityBoost('Product Manager')).toBe(0);
  });
});

describe('estimateCallbackScore', () => {
  it('returns base score of 50 for neutral inputs', () => {
    const result = estimateCallbackScore({
      jobTitle: 'Software Engineer',
      company: 'Unknown Company',
      directApplyLink: 'https://unknown.com/apply/123',
    });
    // Base 50 + high demand role (+5) = 55
    expect(result.score).toBe(55);
  });

  it('lowers score for large companies', () => {
    const largeCompany = estimateCallbackScore({
      jobTitle: 'Product Manager',
      company: 'Google',
      directApplyLink: 'https://careers.google.com/jobs/123',
    });
    const smallCompany = estimateCallbackScore({
      jobTitle: 'Product Manager',
      company: 'TechCo Inc.',
      directApplyLink: 'https://techco.com/jobs/123',
    });
    expect(largeCompany.score).toBeLessThan(smallCompany.score);
  });

  it('raises score for direct ATS platforms', () => {
    const direct = estimateCallbackScore({
      jobTitle: 'Software Engineer',
      company: 'Acme Corp',
      directApplyLink: 'https://boards.greenhouse.io/acme/jobs/123',
    });
    const aggregator = estimateCallbackScore({
      jobTitle: 'Software Engineer',
      company: 'Acme Corp',
      directApplyLink: 'https://www.indeed.com/viewjob?jk=123',
    });
    expect(direct.score).toBeGreaterThan(aggregator.score);
  });

  it('raises score for senior roles', () => {
    const senior = estimateCallbackScore({
      jobTitle: 'Senior Software Engineer',
      company: 'Acme Corp',
      directApplyLink: 'https://acme.com/jobs/123',
    });
    const junior = estimateCallbackScore({
      jobTitle: 'Junior Software Engineer',
      company: 'Acme Corp',
      directApplyLink: 'https://acme.com/jobs/123',
    });
    expect(senior.score).toBeGreaterThan(junior.score);
  });

  it('raises score when resume is provided', () => {
    const withResume = estimateCallbackScore({
      jobTitle: 'Software Engineer',
      company: 'Acme Corp',
      directApplyLink: 'https://acme.com/jobs/123',
      hasResume: true,
    });
    const withoutResume = estimateCallbackScore({
      jobTitle: 'Software Engineer',
      company: 'Acme Corp',
      directApplyLink: 'https://acme.com/jobs/123',
      hasResume: false,
    });
    expect(withResume.score).toBeGreaterThan(withoutResume.score);
  });

  it('raises score for fresh postings', () => {
    const fresh = estimateCallbackScore({
      jobTitle: 'Software Engineer',
      company: 'Acme Corp',
      directApplyLink: 'https://acme.com/jobs/123',
      postedWithinDays: 1,
    });
    const old = estimateCallbackScore({
      jobTitle: 'Software Engineer',
      company: 'Acme Corp',
      directApplyLink: 'https://acme.com/jobs/123',
      postedWithinDays: 20,
    });
    expect(fresh.score).toBeGreaterThan(old.score);
  });

  it('includes rationale explaining the score', () => {
    const result = estimateCallbackScore({
      jobTitle: 'CTO',
      company: 'Stealth Startup',
      directApplyLink: 'https://boards.greenhouse.io/stealth/jobs/123',
    });
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.rationale.some(r => r.toLowerCase().includes('leadership') || r.toLowerCase().includes('senior'))).toBe(true);
  });

  it('clamps score between 0 and 100', () => {
    // Very favorable conditions
    const high = estimateCallbackScore({
      jobTitle: 'VP of Engineering',
      company: 'Early Stage Startup LLC',
      directApplyLink: 'https://boards.greenhouse.io/startup/jobs/123',
      pageType: 'apply_flow',
      hasResume: true,
      postedWithinDays: 1,
    });
    expect(high.score).toBeLessThanOrEqual(100);

    // Very unfavorable conditions
    const low = estimateCallbackScore({
      jobTitle: 'Junior Intern',
      company: 'Google',
      directApplyLink: 'https://www.indeed.com/viewjob?jk=123',
      pageType: 'aggregator',
      postedWithinDays: 30,
    });
    expect(low.score).toBeGreaterThanOrEqual(0);
  });
});
