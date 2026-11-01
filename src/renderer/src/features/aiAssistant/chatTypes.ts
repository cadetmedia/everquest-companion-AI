import type { AlertDef } from '@shared/alertTypes'
import type { AiMentions } from '@shared/aiChat'
import type { AiAnswerSource, AiCitation } from '@shared/aiSources'

/** One bubble. Extra fields are renderer-only; persist keeps role + text. */
export interface ChatMessage {
  role: 'user' | 'ai'
  text: string
  drafts?: AlertDef[]
  mentions?: AiMentions
  pending?: boolean
  toolHint?: string
  /** cadetmedia fork: where the answer came from, its web sources, and the pending
   *  "Search other sources?" question (shared/aiSources.ts). */
  source?: AiAnswerSource
  citations?: AiCitation[]
  widenPrompt?: string
  /** After an instant answer from the app's own data: the question "Ask AI" sends on. */
  askAiPrompt?: string
  /** The question needed the AI and none is set up: show the set-up warning. */
  needsAiSetup?: boolean
}
