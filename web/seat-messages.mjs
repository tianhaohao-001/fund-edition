export function messagesForSeat(messages, member) {
  return messages.filter(message => {
    if (message.memberId) return message.memberId === member.id;
    // Older questions recorded the recipient; older answers recorded the author.
    if (message.role === 'user') return message.recipient === member.name;
    return message.role === 'assistant' && (message.recipient || message.name) === member.name;
  });
}
