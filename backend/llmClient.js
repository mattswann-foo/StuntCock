// StuntCock — Anthropic SDK wrapper for LLM fallback responses
// Uses claude-sonnet-4-6 with conversation context. Caps output at 500 chars.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Anthropic = require('@anthropic-ai/sdk');
const { getConversationHistory, appendConversation, getSetting, getPersona } = require('./db');

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY || getSetting('anthropic_api_key');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Reset client (called when API key is updated at runtime)
function resetClient() {
  client = null;
}

/**
 * Truncates text cleanly at a sentence boundary within maxLen characters.
 */
function truncateAtSentence(text, maxLen = 500) {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastPeriod = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (lastPeriod > maxLen * 0.5) return slice.slice(0, lastPeriod + 1);
  return slice.trimEnd() + '…';
}

/**
 * Generates a reply via Claude for an inbound Signal message.
 *
 * @param {object} opts
 * @param {string} opts.sender - E.164 phone number
 * @param {string} opts.body - the inbound message text
 * @param {string} [opts.groupId] - Signal group ID if applicable
 * @returns {Promise<string>} the reply text (max 500 chars)
 */
async function generateLLMReply({ sender, body, groupId, systemPromptOverride, personaId }) {
  let systemPrompt = systemPromptOverride;
  if (!systemPrompt && personaId) {
    const persona = getPersona(personaId);
    if (persona) systemPrompt = persona.system_prompt;
  }
  if (!systemPrompt) {
    systemPrompt = getSetting('llm_system_prompt',
      'You are a helpful personal assistant replying to Signal messages on behalf of the user. ' +
      'Keep replies brief, friendly, and natural. Never reveal you are an AI unless directly asked.'
    );
  }

  const threadId = groupId || sender;
  const history = getConversationHistory(threadId, 10);

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: body },
  ];

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: systemPrompt,
    messages,
  });

  const raw = response.content[0]?.text ?? '';
  const reply = truncateAtSentence(raw);

  appendConversation(threadId, 'user', body);
  appendConversation(threadId, 'assistant', reply);

  return reply;
}

module.exports = { generateLLMReply, resetClient };
