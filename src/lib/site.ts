export const SITE_OWNER = {
  name: 'Amrinder Rattanpal',
  role: 'Platform engineer writing about Kubernetes, GitOps, SRE, and the operational work that starts after launch day.',
  shortBio: 'I write about real Day 2 operations work: platform design, reliability, release safety, and the systems teams depend on in production.',
  linkedin: 'https://www.linkedin.com/in/amrinder-rattanpal-01531677/',
  github: 'https://github.com/amrinder15',
};

export const resolveAuthorName = (author?: string) => {
  if (!author || author === 'Day2Ops') {
    return SITE_OWNER.name;
  }

  return author;
};