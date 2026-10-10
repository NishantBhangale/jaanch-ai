// .gov.in and .nic.in names are only issued to Indian government bodies, so they carry
// real weight. This is a rule on the domain name, not a guarantee about the page content.
const GOV_SUFFIXES = ['gov.in', 'nic.in'];

export function checkGovDomain(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  const suffix = GOV_SUFFIXES.find((s) => host === s || host.endsWith(`.${s}`));
  return { isGov: Boolean(suffix), suffix: suffix || null };
}
