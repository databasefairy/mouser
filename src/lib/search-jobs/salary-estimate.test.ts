import { describe, it, expect } from 'vitest';
import {
  estimateSalary,
  hasSalaryData,
  detectSeniority,
  detectRoleType,
  isHighPayingCompany,
} from './salary-estimate';

describe('detectSeniority', () => {
  it('detects intern level', () => {
    expect(detectSeniority('Software Engineering Intern')).toBe('intern');
    expect(detectSeniority('Marketing Internship')).toBe('intern');
    expect(detectSeniority('Co-op Developer')).toBe('intern');
  });

  it('detects entry level', () => {
    expect(detectSeniority('Junior Developer')).toBe('entry');
    expect(detectSeniority('Associate Product Manager')).toBe('entry');
    expect(detectSeniority('Software Engineer I')).toBe('entry');
    expect(detectSeniority('New Grad Software Engineer')).toBe('entry');
  });

  it('detects mid level (default)', () => {
    expect(detectSeniority('Software Engineer')).toBe('mid');
    expect(detectSeniority('Product Manager')).toBe('mid');
    expect(detectSeniority('Data Analyst')).toBe('mid');
  });

  it('detects senior level', () => {
    expect(detectSeniority('Senior Software Engineer')).toBe('senior');
    expect(detectSeniority('Sr. Product Manager')).toBe('senior');
    expect(detectSeniority('Software Engineer III')).toBe('senior');
  });

  it('detects staff level', () => {
    expect(detectSeniority('Staff Software Engineer')).toBe('staff');
    expect(detectSeniority('Staff Product Designer')).toBe('staff');
  });

  it('detects principal level', () => {
    expect(detectSeniority('Principal Engineer')).toBe('principal');
    expect(detectSeniority('Distinguished Engineer')).toBe('principal');
  });

  it('detects lead level', () => {
    expect(detectSeniority('Tech Lead')).toBe('lead');
    expect(detectSeniority('Lead Designer')).toBe('lead');
    expect(detectSeniority('Head of Engineering')).toBe('lead');
  });

  it('detects manager level', () => {
    expect(detectSeniority('Engineering Manager')).toBe('manager');
    expect(detectSeniority('Product Manager')).toBe('mid'); // PM is a role, not people management
  });

  it('detects director level', () => {
    expect(detectSeniority('Director of Engineering')).toBe('director');
    expect(detectSeniority('Engineering Director')).toBe('director');
  });

  it('detects VP level', () => {
    expect(detectSeniority('VP of Engineering')).toBe('vp');
    expect(detectSeniority('Vice President, Product')).toBe('vp');
  });

  it('detects SVP/EVP level', () => {
    expect(detectSeniority('SVP of Engineering')).toBe('svp');
    expect(detectSeniority('Senior Vice President, Product')).toBe('svp');
    expect(detectSeniority('Executive Vice President')).toBe('svp');
  });

  it('detects C-level', () => {
    expect(detectSeniority('CTO')).toBe('c_level');
    expect(detectSeniority('Chief Technology Officer')).toBe('c_level');
    expect(detectSeniority('CEO')).toBe('c_level');
  });
});

describe('detectRoleType', () => {
  it('detects engineering roles', () => {
    expect(detectRoleType('Software Engineer')).toBe('engineering');
    expect(detectRoleType('Backend Developer')).toBe('engineering');
    expect(detectRoleType('DevOps Engineer')).toBe('engineering');
    expect(detectRoleType('SRE')).toBe('engineering');
    expect(detectRoleType('Platform Architect')).toBe('engineering');
  });

  it('detects product roles', () => {
    expect(detectRoleType('Product Manager')).toBe('product');
    expect(detectRoleType('Senior PM')).toBe('product');
    expect(detectRoleType('Product Owner')).toBe('product');
  });

  it('detects design roles', () => {
    expect(detectRoleType('UX Designer')).toBe('design');
    expect(detectRoleType('Product Designer')).toBe('design');
    expect(detectRoleType('UI/UX Designer')).toBe('design');
  });

  it('detects data roles', () => {
    expect(detectRoleType('Data Scientist')).toBe('data');
    expect(detectRoleType('Data Engineer')).toBe('data');
    expect(detectRoleType('ML Engineer')).toBe('data');
    expect(detectRoleType('Machine Learning Engineer')).toBe('data');
  });

  it('detects marketing roles', () => {
    expect(detectRoleType('Marketing Manager')).toBe('marketing');
    expect(detectRoleType('Growth Marketing Lead')).toBe('marketing');
    expect(detectRoleType('Content Strategist')).toBe('marketing');
  });

  it('detects sales roles', () => {
    expect(detectRoleType('Account Executive')).toBe('sales');
    expect(detectRoleType('Sales Representative')).toBe('sales');
    expect(detectRoleType('SDR')).toBe('sales');
    expect(detectRoleType('Customer Success Manager')).toBe('sales');
  });

  it('detects operations roles', () => {
    expect(detectRoleType('Operations Manager')).toBe('operations');
    expect(detectRoleType('Project Manager')).toBe('operations');
    expect(detectRoleType('Program Manager')).toBe('operations');
  });

  it('detects HR roles', () => {
    expect(detectRoleType('HR Manager')).toBe('hr');
    expect(detectRoleType('Recruiter')).toBe('hr');
    expect(detectRoleType('Talent Acquisition')).toBe('hr');
  });

  it('detects finance roles', () => {
    expect(detectRoleType('Financial Analyst')).toBe('finance');
    expect(detectRoleType('Accountant')).toBe('finance');
    expect(detectRoleType('FP&A Manager')).toBe('finance');
  });

  it('detects legal roles', () => {
    expect(detectRoleType('Legal Counsel')).toBe('legal');
    expect(detectRoleType('Compliance Officer')).toBe('legal');
  });

  it('detects support roles', () => {
    expect(detectRoleType('Customer Support')).toBe('support');
    expect(detectRoleType('Technical Support Engineer')).toBe('support');
  });

  it('defaults to general for unknown roles', () => {
    expect(detectRoleType('Cat Herder')).toBe('general');
    expect(detectRoleType('Chief Happiness Officer')).toBe('general'); // C-level but not a standard role
  });
});

describe('isHighPayingCompany', () => {
  it('identifies FAANG companies', () => {
    expect(isHighPayingCompany('Google')).toBe(true);
    expect(isHighPayingCompany('Meta')).toBe(true);
    expect(isHighPayingCompany('Apple Inc.')).toBe(true);
    expect(isHighPayingCompany('Amazon')).toBe(true);
    expect(isHighPayingCompany('Netflix')).toBe(true);
  });

  it('identifies top tech companies', () => {
    expect(isHighPayingCompany('Microsoft')).toBe(true);
    expect(isHighPayingCompany('Stripe')).toBe(true);
    expect(isHighPayingCompany('Airbnb')).toBe(true);
    expect(isHighPayingCompany('OpenAI')).toBe(true);
  });

  it('identifies finance companies', () => {
    expect(isHighPayingCompany('Goldman Sachs')).toBe(true);
    expect(isHighPayingCompany('Jane Street')).toBe(true);
    expect(isHighPayingCompany('Citadel')).toBe(true);
  });

  it('returns false for unknown companies', () => {
    expect(isHighPayingCompany('Random Startup Inc')).toBe(false);
    expect(isHighPayingCompany('Small Business LLC')).toBe(false);
  });
});

describe('estimateSalary', () => {
  it('estimates salary for mid-level engineer', () => {
    const salary = estimateSalary('Software Engineer', 'Some Company');
    expect(salary.is_estimated).toBe(true);
    expect(salary.currency).toBe('USD');
    expect(salary.period).toBe('yearly');
    expect(salary.min).toBeGreaterThan(100000);
    expect(salary.max).toBeGreaterThan(salary.min);
  });

  it('estimates higher salary for senior roles', () => {
    const mid = estimateSalary('Software Engineer', 'Some Company');
    const senior = estimateSalary('Senior Software Engineer', 'Some Company');
    expect(senior.min).toBeGreaterThan(mid.min);
  });

  it('estimates higher salary for staff roles than senior', () => {
    const senior = estimateSalary('Senior Software Engineer', 'Some Company');
    const staff = estimateSalary('Staff Software Engineer', 'Some Company');
    expect(staff.min).toBeGreaterThan(senior.min);
  });

  it('estimates higher salary for FAANG companies', () => {
    const regular = estimateSalary('Software Engineer', 'Random Startup');
    const faang = estimateSalary('Software Engineer', 'Google');
    expect(faang.min).toBeGreaterThan(regular.min);
  });

  it('applies industry multipliers', () => {
    const tech = estimateSalary('Software Engineer', 'Tech Corp', 'Technology (Software/SaaS)');
    const nonprofit = estimateSalary('Software Engineer', 'Charity Org', 'Nonprofit');
    expect(tech.min).toBeGreaterThan(nonprofit.min);
  });

  it('estimates lower salary for interns', () => {
    const intern = estimateSalary('Software Engineering Intern', 'Some Company');
    const mid = estimateSalary('Software Engineer', 'Some Company');
    expect(intern.min).toBeLessThan(mid.min * 0.5);
  });

  it('estimates very high salary for C-level', () => {
    const cto = estimateSalary('CTO', 'Some Company');
    const mid = estimateSalary('Software Engineer', 'Some Company');
    expect(cto.min).toBeGreaterThan(mid.min * 2);
  });

  it('estimates different salaries for different role types', () => {
    const engineer = estimateSalary('Software Engineer', 'Acme Corp');
    const support = estimateSalary('Customer Support', 'Acme Corp');
    expect(engineer.min).toBeGreaterThan(support.min);
  });
});

describe('hasSalaryData', () => {
  it('returns true for valid salary with min', () => {
    expect(hasSalaryData({ min: 100000 })).toBe(true);
  });

  it('returns true for valid salary with max', () => {
    expect(hasSalaryData({ max: 150000 })).toBe(true);
  });

  it('returns true for valid salary with both', () => {
    expect(hasSalaryData({ min: 100000, max: 150000 })).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(hasSalaryData(null)).toBe(false);
    expect(hasSalaryData(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(hasSalaryData({})).toBe(false);
  });

  it('returns false for zero values', () => {
    expect(hasSalaryData({ min: 0, max: 0 })).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(hasSalaryData('100000')).toBe(false);
    expect(hasSalaryData(100000)).toBe(false);
  });
});
