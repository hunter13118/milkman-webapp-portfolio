import { projectHref, siteUrls } from '../config/site.js';

/** @typedef {import('./projects.js').Project} Project */

export const profile = {
  name: 'Hunter Uhr',
  employer: 'Daugherty Business Solutions / CGI',
  title: 'Senior Software Engineer · Senior Consultant',
  tagline:
    '6+ years delivering full-stack solutions — front-end architecture, cloud integration, test automation, and AI-assisted workflows across enterprise and personal platforms.',
  location: 'Minneapolis, MN',
  email: '',
  github: 'https://github.com/hunter13118',
  linkedin: 'https://www.linkedin.com/in/hunter-uhr-331075165/',
  /** No public resume file — CGI template is confidential; use LinkedIn */
  resumeUrl: null,
  warCouncilUrl: projectHref(siteUrls.warCouncil, siteUrls.warCouncilRepo),
  education: 'B.S. Computer Science — University of Minnesota Twin Cities',
  certifications: ['ICAgile Certified Professional'],
  metrics: [
    { label: 'Years of experience', value: '6+' },
    { label: 'Enterprise clients', value: '8+' },
    { label: 'Playwright / E2E suites', value: '5+' },
    { label: 'AI orchestration tools', value: '20+' },
  ],
};
