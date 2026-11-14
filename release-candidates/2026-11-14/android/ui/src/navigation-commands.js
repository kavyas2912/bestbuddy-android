const navigationCommands = new Map([
  ['home', 'home'],
  ['discover', 'explore'],
  ['explore', 'explore'],
  ['media', 'media'],
  ['my day', 'daybook'],
  ['day book', 'daybook'],
  ['settings', 'settings'],
  ['more', 'settings'],
  ['preferences', 'settings'],
]);

export function resolveNavigationCommand(text) {
  const command = text.trim().toLowerCase().replace(/[.!?]+$/, '')
    .replace(/^please\s+/, '')
    .replace(/^(?:open |show me |go to |take me to )(?:the )?/, '');
  return navigationCommands.get(command);
}
