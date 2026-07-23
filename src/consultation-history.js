export function isCloneUserMessage(message) {
  if (message?.role !== 'user') return false;
  if (message.metadata?.product === 'clone') return true;
  const content = String(message.content || '');
  return content.includes('Звёздный клон') && content.includes('Ситуация:');
}

function isCloneAssistantMessage(message) {
  return message?.role === 'assistant' && message.metadata?.product === 'clone';
}

function stripLegacyReservation(content) {
  return String(content || '').replace(/^\[\[clone-reservation:[^\]]+\]\]\s*/i, '').trim();
}

export function extractCloneHistory(messages = []) {
  const result = [];
  let pendingUser = null;

  for (const message of messages) {
    if (isCloneUserMessage(message)) {
      pendingUser = { ...message, content: stripLegacyReservation(message.content) };
      continue;
    }

    if (message?.role === 'assistant' && pendingUser) {
      result.push(pendingUser, { ...message, content: stripLegacyReservation(message.content) });
      pendingUser = null;
    }
  }

  return result;
}

export function historyForProduct(messages = [], product = 'herostar') {
  if (product === 'clone') return extractCloneHistory(messages);

  const result = [];
  let skipCloneAssistant = false;
  for (const message of messages) {
    if (isCloneUserMessage(message)) {
      skipCloneAssistant = true;
      continue;
    }
    if (message?.role === 'assistant' && (skipCloneAssistant || isCloneAssistantMessage(message))) {
      skipCloneAssistant = false;
      continue;
    }
    if (message?.metadata?.product === 'clone') continue;
    result.push({ ...message, content: stripLegacyReservation(message.content) });
  }
  return result;
}
