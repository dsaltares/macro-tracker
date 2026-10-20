const reservedTopLevelDomains = ['test', 'example', 'invalid', 'localhost'];

const reservedDomains = ['example.com', 'example.net', 'example.org'];

const domainOf = (address: string) => {
  const at = address.lastIndexOf('@');
  if (at === -1) {
    return '';
  }
  return address
    .slice(at + 1)
    .trim()
    .toLowerCase();
};

export const isReservedRecipient = (to: string) => {
  const domain = domainOf(to);
  if (!domain) {
    return false;
  }
  return (
    reservedDomains.includes(domain) ||
    reservedTopLevelDomains.some(
      (suffix) => domain === suffix || domain.endsWith(`.${suffix}`),
    )
  );
};

export const reservedRecipientReason =
  'the recipient is a reserved address no real mailbox can hold';
