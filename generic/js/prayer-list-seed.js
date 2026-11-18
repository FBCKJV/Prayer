// Starting content for the standing Weekly Prayer List. This is what everyone
// sees until a church leader edits + saves it in the app (📋 Prayer List →
// Edit), which stores it in Firestore at lists/weekly and takes over from
// this seed. Each section is one item per line.

export const LIST_SECTIONS = [
  'The Lost',
  'Praise',
  'Health',
  'Government',
  'Church',
  'Missionaries',
  'Unspoken',
  'Other',
];

export const LIST_SEED = {
  'The Lost': '',
  'Praise': '',
  'Health': '',
  'Government': [
    'Our President and national leaders',
    'Our governor and state leaders',
    'Local leaders, police, firefighters & first responders',
  ].join('\n'),
  'Church': [
    'Our pastor and family',
    'Church leaders and teachers',
    'Visitors and new members',
  ].join('\n'),
  'Missionaries': '',
  'Unspoken': '',
  'Other': '',
};
