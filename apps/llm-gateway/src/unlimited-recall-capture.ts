/**
 * Unlimited Recall Message Capture
 * Captures ALL messages (100%) to conversation storage
 */

import { randomUUID } from 'crypto';
import { getDatabase } from './database.js';
import { UnlimitedRecallDB } from './unlimited-recall-db.js';
import { logger } from './log.js';
import type { MessageEvent } from '@llm-gateway/shared';

/**
 * Analyze message content for metadata
 */
function analyzeMessage(content: string, role: string): {
  isCodeHeavy: boolean;
  isQuestion: boolean;
  hasDecision: boolean;
} {
  const lower = content.toLowerCase();

  // Detect code blocks
  const codeBlockCount = (content.match(/```/g) || []).length / 2;
  const hasCodeKeywords = /\b(function|class|const|let|var|import|export|return|if|else|for|while)\b/i.test(content);
  const isCodeHeavy = codeBlockCount > 0 || (hasCodeKeywords && content.length > 100);

  // Detect questions
  const hasQuestionMark = content.includes('?');
  const hasQuestionWords = /\b(how|what|why|when|where|who|can|could|would|should|is|are|does|do)\b/i.test(content);
  const isQuestion = role === 'user' && (hasQuestionMark || hasQuestionWords);

  // Detect decisions
  const decisionKeywords = [
    'decided', 'chosen', 'selected', 'going with', 'will use',
    'final', 'conclusion', 'result', 'solution', 'fixed', 'resolved'
  ];
  const hasDecision = decisionKeywords.some(keyword => lower.includes(keyword));

  return {
    isCodeHeavy,
    isQuestion,
    hasDecision
  };
}

/**
 * Estimate tokens (rough approximation)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Capture message to unlimited recall storage
 */
export async function captureMessageToUnlimitedRecall(event: MessageEvent): Promise<void> {
  try {
    const db = getDatabase();
    const recallDB = new UnlimitedRecallDB(db);

    // Analyze message
    const analysis = analyzeMessage(event.content, event.role);

    // Store message
    const messageId = randomUUID();
    recallDB.storeMessage({
      id: messageId,
      user_id: event.userId,
      thread_id: event.threadId,
      msg_id: event.msgId,
      role: event.role,
      content: event.content,
      tokens_input: event.tokens.input,
      tokens_output: event.tokens.output,
      is_code_heavy: analysis.isCodeHeavy,
      is_question: analysis.isQuestion,
      has_decision: analysis.hasDecision
    });

    // Update conversation package
    await updateConversationPackage(recallDB, event, analysis);

    // Enqueue jobs for label/summary generation if needed
    await enqueueMaintenanceJobs(recallDB, event);

    logger.debug({
      userId: event.userId,
      threadId: event.threadId,
      role: event.role,
      tokens: event.tokens.input + event.tokens.output,
      isCodeHeavy: analysis.isCodeHeavy,
      hasDecision: analysis.hasDecision
    }, 'Message captured to unlimited recall');

  } catch (error: any) {
    logger.error({
      error: error.message,
      stack: error.stack,
      userId: event.userId,
      threadId: event.threadId
    }, 'Failed to capture message to unlimited recall');
    // Don't throw - this is a background operation
  }
}

/**
 * Update or create conversation package
 */
async function updateConversationPackage(
  recallDB: UnlimitedRecallDB,
  event: MessageEvent,
  analysis: { isCodeHeavy: boolean; hasDecision: boolean }
): Promise<void> {
  // Get existing package
  const existing = recallDB.getConversationPackage(event.threadId, event.userId);

  const now = Math.floor(Date.now() / 1000);
  const totalTokens = event.tokens.input + event.tokens.output;

  if (existing) {
    // Update existing
    recallDB.upsertConversationPackage({
      thread_id: event.threadId,
      user_id: event.userId,
      message_count: existing.message_count + 1,
      total_tokens: existing.total_tokens + totalTokens,
      user_msg_count: existing.user_msg_count + (event.role === 'user' ? 1 : 0),
      assistant_msg_count: existing.assistant_msg_count + (event.role === 'assistant' ? 1 : 0),
      has_code: existing.has_code || analysis.isCodeHeavy,
      has_decisions: existing.has_decisions || analysis.hasDecision,
      last_message_at: now
    });
  } else {
    // Create new package with temporary label
    recallDB.upsertConversationPackage({
      thread_id: event.threadId,
      user_id: event.userId,
      label: `New conversation - ${new Date().toISOString().split('T')[0]}`,
      label_tokens: 0,
      message_count: 1,
      total_tokens: totalTokens,
      user_msg_count: event.role === 'user' ? 1 : 0,
      assistant_msg_count: event.role === 'assistant' ? 1 : 0,
      has_code: analysis.isCodeHeavy,
      has_decisions: analysis.hasDecision,
      first_message_at: now,
      last_message_at: now,
      importance_score: 0.5
    });
  }
}

/**
 * Enqueue background jobs for label/summary generation
 */
async function enqueueMaintenanceJobs(
  recallDB: UnlimitedRecallDB,
  event: MessageEvent
): Promise<void> {
  const pkg = recallDB.getConversationPackage(event.threadId, event.userId);
  if (!pkg) return;

  // Generate label after 5 messages
  if (pkg.message_count === 5 && !pkg.label_generated_at) {
    recallDB.enqueueJob({
      id: randomUUID(),
      job_type: 'label',
      thread_id: event.threadId,
      user_id: event.userId,
      priority: 8,
      status: 'pending',
      retry_count: 0,
      max_retries: 3,
      error: null,
      result: null
    });
  }

  // Generate/update summary every 20 messages
  if (pkg.message_count % 20 === 0 || (pkg.message_count === 10 && !pkg.summary)) {
    recallDB.enqueueJob({
      id: randomUUID(),
      job_type: 'summary',
      thread_id: event.threadId,
      user_id: event.userId,
      priority: 6,
      status: 'pending',
      retry_count: 0,
      max_retries: 3,
      error: null,
      result: null
    });
  }

  // Generate embeddings after summary is created
  if (pkg.summary && !pkg.summary_updated_at) {
    recallDB.enqueueJob({
      id: randomUUID(),
      job_type: 'embedding',
      thread_id: event.threadId,
      user_id: event.userId,
      priority: 4,
      status: 'pending',
      retry_count: 0,
      max_retries: 3,
      error: null,
      result: null
    });
  }
}

/**
 * Get conversation statistics
 */
export function getUnlimitedRecallStats(userId: string): any {
  try {
    const db = getDatabase();
    const recallDB = new UnlimitedRecallDB(db);
    return recallDB.getConversationStats(userId);
  } catch (error: any) {
    logger.error({ error: error.message, userId }, 'Failed to get unlimited recall stats');
    return { total: 0, total_messages: 0, total_tokens: 0 };
  }
}
