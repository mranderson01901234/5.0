import { useChatStore } from "../store/chatStore";
import { streamChat } from "../services/gateway";
import { nanoid } from "../lib/id";
import { useAuth } from "@clerk/clerk-react";
import { handleApiError } from '@/utils/handleApiError';
import { log } from '@/utils/logger';
import type { ApiMessage } from '@/types/api';
import { getThinkingEngine } from '@/lib/thinking/ThinkingEngine';
import { classifyArtifactIntent, classifyArtifactIntentViaAPI, type ArtifactIntent } from '@/utils/classifyArtifactIntent';
import { autoDetectTableFormat } from '@/utils/tableParser';
import { useArtifactStore } from '@/store/artifactStore';
import { logEvent } from '@/lib/eventLogger';
import { useUser } from '@clerk/clerk-react';
import { scrollArtifactIntoView } from '@/utils/scrollIntoViewAnchor';
import { extractFileText } from '@/services/fileExtraction';
import { generateImageResponseMessage, waitForImageArtifact, getAnimatedDots } from '@/utils/imageResponsePrompts';

export type StreamEvent =
  | { type: 'open' }
  | { type: 'message'; data: ApiMessage }
  | { type: 'error'; error: string }
  | { type: 'done' }
  | { type: 'delta'; data: string | { text?: string } }
  | { type: 'preface'; data: string | { text?: string } }
  | { type: 'research_thinking' }
  | { type: 'ingestion_context'; data?: { items?: unknown[] } }
  | { type: 'research_summary'; data: string | { summary?: string; text?: string } | null }
  | { type: 'sources'; data: Array<{ title: string; host: string; url?: string; date?: string }> | null }
  | { type: 'thinking_step'; data: string | { content?: string; text?: string } };

function generateTitle(msg: string): string {
  if(!msg.trim()) return "New Chat";
  const text = msg.trim();
  const preview = text.slice(0, 50);
  return preview.length < text.length ? preview + "..." : preview;
}

export function useChatStream(){
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.id || '';
  
  return {
    async send(text:string, attachments?: Array<{ id: string; filename: string; mimeType: string; size: number; url?: string }>){
      if(!text.trim() && (!attachments || attachments.length === 0)) return;
      
      const state = useChatStore.getState();
      const conversations = state.conversations;
      let currentThreadId = state.currentThreadId;
      let currentConv = conversations.find(c => c.id === currentThreadId);
      let items = currentConv?.messages || [];

      if(state.activeStreams>=2) { log.warn("stream cap reached"); return; }

      // Create new conversation ONLY if we don't have a currentThreadId at all
      // Don't create if we have a threadId but empty messages (user already clicked "New Chat")
      if(!currentThreadId) {
        state.newConversation();
        // Re-fetch after creating new conversation
        const newState = useChatStore.getState();
        currentThreadId = newState.currentThreadId;
        currentConv = newState.conversations.find(c => c.id === currentThreadId);
        items = currentConv?.messages || [];
      }

      const newThreadId = currentThreadId;
      const newItems = items;
      
      // Mark conversation as no longer local-only once we send first message
      const currentState = useChatStore.getState();
      const currentConvForLocal = currentState.conversations.find(c => c.id === newThreadId);
      if (currentConvForLocal?.isLocal) {
        // Clear isLocal flag - conversation will exist on server after first message
        useChatStore.setState({
          conversations: currentState.conversations.map(c =>
            c.id === newThreadId ? { ...c, isLocal: false } : c
          ),
        });
      }
      
      const user = { 
        id:nanoid(), 
        role:"user" as const, 
        content:text.trim() || '', 
        ...(attachments && attachments.length > 0 ? { attachments } : {})
      };
      
      // Extract text from document attachments and append to message content
      let enrichedContent = text.trim() || '';
      if (attachments && attachments.length > 0) {
        const token = await getToken();
        const extractedTexts: string[] = [];
        
        for (const attachment of attachments) {
          // Check if file type supports text extraction
          const canExtract = attachment.mimeType === 'application/pdf' ||
                            attachment.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                            attachment.mimeType === 'text/plain' ||
                            attachment.mimeType.startsWith('text/');
          
          if (canExtract) {
            try {
              const extracted = await extractFileText(attachment.id, token || undefined);
              if (extracted.extractedText.trim()) {
                extractedTexts.push(`\n\n[File: ${attachment.filename}]\n${extracted.extractedText.trim()}`);
              }
            } catch (error) {
              log.warn(`[useChatStream] Failed to extract text from ${attachment.filename}`, error);
              // Continue with other files even if one fails
            }
          }
        }
        
        if (extractedTexts.length > 0) {
          enrichedContent = (enrichedContent ? enrichedContent + '\n\n' : '') + extractedTexts.join('\n\n');
        }
      }
      
      // Update user message with enriched content
      const enrichedUser = {
        ...user,
        content: enrichedContent || user.content,
      };
      
      // Auto-generate title from first user message
      if(newItems.length === 0) {
        const title = generateTitle(text);
        const currentState = useChatStore.getState();
        const updatedConvs = currentState.conversations.map(c => 
          c.id === newThreadId ? { ...c, title } : c
        );
        useChatStore.setState({ conversations: updatedConvs });
      }
      
      state.add(enrichedUser);
      const assistant = { id:nanoid(), role:"assistant" as const, content:"" };
      state.add(assistant);
      state.start();
      const t0 = performance.now();
      state.setTTFB(undefined);

      // Early detection of image intent
      let imageIntentDetected = false;
      let earlyImageIntent: ArtifactIntent | null = null;
      try {
        const token = await getToken();
        if (userId && token) {
          // Try to detect image intent early using API
          earlyImageIntent = await classifyArtifactIntentViaAPI(text, newThreadId, userId, token);
          if (earlyImageIntent.shouldCreate && earlyImageIntent.type === 'image') {
            imageIntentDetected = true;
            log.info('[useChatStream] Early image intent detected', {
              confidence: earlyImageIntent.confidence,
              userText: text.substring(0, 100),
            });
          }
        }
      } catch (error) {
        // Fallback to local classification
        const localIntent = classifyArtifactIntent(text);
        if (localIntent.shouldCreate && localIntent.type === 'image') {
          imageIntentDetected = true;
          earlyImageIntent = localIntent;
          log.info('[useChatStream] Early image intent detected (local)', {
            confidence: localIntent.confidence,
            userText: text.substring(0, 100),
          });
        }
      }

      // Generate contextual thinking steps
      const thinkingEngine = getThinkingEngine();
      let thinkingStream;
      let baseMessageForDots: string | null = null;
      
      if (imageIntentDetected) {
        // Force image category for thinking steps
        // We'll manually create image thinking steps since patternMatcher might not catch it
        const baseSteps = [
          { text: 'Analyzing image requirements...', duration: 0, depth: 0 },
          { text: 'Processing visual details...', duration: 0, depth: 0 },
          { text: 'Preparing image generation...', duration: 0, depth: 1 },
          { text: 'Rendering image...', duration: 0, depth: 0 },
        ];
        thinkingStream = {
          steps: baseSteps.map((step, index) => ({
            ...step,
            duration: index === 0 ? 300 : index === baseSteps.length - 1 ? 500 : 400,
          })),
          totalDuration: 1500,
          context: {
            category: 'image' as const,
            complexity: 'moderate' as const,
            keywords: [],
            entities: [],
            intent: 'create',
          },
        };
        
        // Set placeholder message for image generation (without dots initially)
        // This will be immediately visible and then animated dots will start
        const basePlaceholderMessage = generateImageResponseMessage(text);
        state.patchAssistant(basePlaceholderMessage);
        // Store the base message for the animated dots interval
        baseMessageForDots = basePlaceholderMessage;
      } else {
        thinkingStream = thinkingEngine.generateThinking(text);
      }

      // Add thinking steps progressively
      let thinkingStepIndex = 0;
      const addThinkingSteps = () => {
        if (thinkingStepIndex < thinkingStream.steps.length) {
          const step = thinkingStream.steps[thinkingStepIndex];
          if (step) {
            state.addThinkingStep(step.text);
            thinkingStepIndex++;

            // Schedule next step
            if (thinkingStepIndex < thinkingStream.steps.length) {
              setTimeout(addThinkingSteps, step.duration);
            }
          }
        }
      };

      // Start showing thinking steps immediately
      setTimeout(addThinkingSteps, 100);

      log.info('[useChatStream] Started stream', {
        threadId: newThreadId,
        assistantId: assistant.id,
        userMessage: text.substring(0, 50),
        thinkingCategory: thinkingStream.context.category,
        thinkingSteps: thinkingStream.steps.length
      });
      
      // Declare variables outside try block for cleanup in finally
      let dotsInterval: NodeJS.Timeout | null = null;
      let imageGenerationPromise: Promise<void> | null = null;
      const abortController = new AbortController();
      const signal = abortController.signal;
      
      // Cleanup function
      const cleanup = () => {
        abortController.abort();
        if (dotsInterval) {
          clearInterval(dotsInterval);
          dotsInterval = null;
        }
      };
      
      try {
      const token = await getToken();
      
      // For image requests, start image generation immediately
      if (imageIntentDetected) {
        // Start animated dots - use the base message that was already set
        let dotsFrame = 0;
        const baseMessage = baseMessageForDots || generateImageResponseMessage(text);
        // Remove the trailing "..." from base message - we'll animate dots instead
        const messageWithoutDots = baseMessage.replace(/\.{3}\s*$/, '').trim();
        dotsInterval = setInterval(() => {
          // Check if aborted
          if (signal.aborted) {
            clearInterval(dotsInterval!);
            dotsInterval = null;
            return;
          }
          dotsFrame++;
          const dots = getAnimatedDots(dotsFrame);
          // Update message with animated dots
          state.patchAssistant(`${messageWithoutDots}${dots}`);
        }, 500); // Update every 500ms
        
        // Start image generation in parallel
        imageGenerationPromise = (async () => {
          try {
            const res = await fetch('/api/artifacts/image', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                threadId: newThreadId,
                prompt: text,
              }),
              signal, // Add abort signal
            });

            if (!res.ok) {
              const errorBody = await res.json();
              throw new Error(errorBody.error || 'Image generation API call failed');
            }

            const { artifactId } = await res.json();
            
            // Load artifacts
            const artifactStore = useArtifactStore.getState();
            await artifactStore.loadArtifacts(newThreadId, token || undefined);

            // Wait for image artifact to appear with images loaded
            log.info('[useChatStream] Waiting for image artifact to be ready', { artifactId });
            await waitForImageArtifact(artifactId, newThreadId, 30000);
            
            // Check if aborted during wait
            if (signal.aborted) {
              log.debug('[useChatStream] Image generation aborted');
              return;
            }
            
            // Clear dots animation
            if (dotsInterval) {
              clearInterval(dotsInterval);
              dotsInterval = null;
            }
            
            // Remove dots from message - keep just the base message without dots
            const messageWithoutDots = baseMessage.replace(/\.{3}\s*$/, '').trim();
            state.patchAssistant(messageWithoutDots);
            
            setTimeout(() => {
              scrollArtifactIntoView(artifactId);
            }, 300);

            logEvent({
              event: 'artifact_created',
              type: 'image',
              artifactId,
              threadId: newThreadId,
              confidence: earlyImageIntent?.confidence || 0.9,
            });
            
            log.info('[useChatStream] Image artifact ready');
          } catch (imageError) {
            // Don't log abort errors
            if (imageError instanceof Error && imageError.name === 'AbortError') {
              log.debug('[useChatStream] Image generation aborted');
              return;
            }
            if (dotsInterval) {
              clearInterval(dotsInterval);
              dotsInterval = null;
            }
            log.error('[useChatStream] Failed to create image artifact.', { error: imageError });
            // Remove dots
            const messageWithoutDots = baseMessage.replace(/\.{3}\s*$/, '').trim();
            state.patchAssistant(messageWithoutDots);
          }
        })();
      }
      
      const currentState = useChatStore.getState();
      // Get messages from store - user message was already added on line 83, so don't concat it again
      const lastK = currentState.conversations.find(c => c.id === newThreadId)?.messages.slice(-10) || [];
      const { firstAtGetter, stream } = await streamChat({ threadId: newThreadId, messages: lastK }, token || undefined, signal);
        let gotPrimary=false;
        let hasResearchSummary = false;
        let finalResponseText = ""; // Track final response for artifact detection
        
        for await (const {ev,data} of stream){
          // Check if aborted
          if (signal.aborted) {
            log.debug('[useChatStream] Stream aborted');
            break;
          }
          
          // Debug: log all events
          log.debug('[useChatStream] Stream event:', { ev, dataPreview: typeof data === 'string' ? data.substring(0, 50) : data });

          if(ev==="preface"){
            if(performance.now()-t0>400 && !gotPrimary){ 
              const text = typeof data === 'string' ? data : (data?.text || "Working on it…");
              state.setFRChip(text); 
            }
          } else if(ev==="research_thinking"){
            // Research has started - show thinking indicator
            state.setResearchThinking(true);
            state.setResearchSummary(undefined);
          } else if(ev==="ingestion_context"){
            // Ingested context from knowledge base - this is passed to LLM as context, not displayed directly
            // The LLM will synthesize this information naturally into its response
            log.debug('[useChatStream] ingestion_context event received (LLM will synthesize)', { ev, itemsCount: data?.items?.length || 0 });
            // Do NOT add to message content - the backend already includes this in the LLM context
            // The LLM will naturally integrate this information into its conversational response
          } else if(ev==="research_summary"){
            // Web search results arrived - insert as natural message
            log.debug('[useChatStream] research_summary event received', { ev, data, dataType: typeof data });
            
            // Handle both object and string data formats
            let summary: string | null = null;
            if (data && typeof data === 'object' && data.summary) {
              summary = data.summary;
            } else if (data && typeof data === 'string' && data.trim().length > 0) {
              // Try parsing as JSON string
              try {
                const parsed = JSON.parse(data);
                summary = parsed.summary || data;
              } catch {
                summary = data;
              }
            } else if (data && typeof data === 'object') {
              // Data is object but might have summary in different format
              const dataObj = data as { summary?: string; text?: string };
              summary = dataObj.summary || dataObj.text || null;
            }
            
            if (summary && summary.trim().length > 0) {
              // Convert ugly bullets to proper - bullets (with optional leading whitespace)
              summary = summary.replace(/^\s*L\.\s+/gm, '- ');
              summary = summary.replace(/^\s*\d+\.\s+/gm, '- ');
              summary = summary.replace(/^\s*[└├│]\s*\.?\s*/gm, '- ');

              log.debug('[useChatStream] Injecting research summary:', summary.substring(0, 100));
              const currentMsgs = useChatStore.getState().conversations.find(c => c.id === newThreadId)?.messages || [];
              const lastMsg = currentMsgs[currentMsgs.length - 1];
              if(lastMsg && lastMsg.role === "assistant") {
                // Replace empty assistant message with web search summary
                state.patchAssistant(summary);
                // Track final response text for artifact detection
                finalResponseText = summary;
                hasResearchSummary = true;
                state.setResearchThinking(false);
              } else {
                log.warn('[useChatStream] No assistant message found to inject research summary');
              }
            } else {
              log.warn('[useChatStream] research_summary event received but no valid summary found', { data, dataType: typeof data });
            }
          } else if(ev==="delta"){
            // If image intent was detected early, completely suppress LLM delta responses
            // The placeholder message with animated dots should stay visible
            if (imageIntentDetected) {
              // Ignore delta completely - don't update the message at all
              // The animated dots interval is already updating the placeholder message
              // Just track for artifact detection (but won't be used)
              let deltaText = typeof data === 'string' ? data : (data?.text || data || "");
              finalResponseText += deltaText;
              // Don't call state.patchAssistant - keep placeholder visible
            } else {
              if(!gotPrimary){
                const firstAt = firstAtGetter();
                if(firstAt) {
                  const ttfbMs = firstAt - t0;
                  state.setTTFB(ttfbMs);
                  const frChip = useChatStore.getState().frChip;
                  if(ttfbMs > 400 && frChip){
                    // Keep FR chip visible
                  } else {
                    state.setFRChip(undefined);
                  }
                }
                gotPrimary=true;
              } else {
                state.setFRChip(undefined);
              }
              const currentMsgs = useChatStore.getState().conversations.find(c => c.id === newThreadId)?.messages || [];
              const lastMsg = currentMsgs[currentMsgs.length - 1];
              let deltaText = typeof data === 'string' ? data : (data?.text || data || "");

              // Convert ugly bullets (L., numbers, box chars) to proper - bullets (with optional leading whitespace)
              deltaText = deltaText.replace(/^\s*L\.\s+/gm, '- ');
              deltaText = deltaText.replace(/^\s*\d+\.\s+/gm, '- ');
              deltaText = deltaText.replace(/^\s*[└├│]\s*\.?\s*/gm, '- ');

              const currentContent = lastMsg?.content || "";

              // Append delta naturally - no hard separators needed
              // If there's existing content (from web search or ingestion context), the LLM should continue naturally
              // or we append with a simple newline for natural flow
              const separator = (hasResearchSummary && currentContent && currentContent.trim()) ? "\n\n" : "";

              // Simple delta append - all formatting comes from LLM
              const updatedContent = currentContent + separator + deltaText;
              state.patchAssistant(updatedContent);
              
              // Track final response text for artifact detection
              finalResponseText = updatedContent;
              
              // Reset flag after first delta
              if (hasResearchSummary) {
                hasResearchSummary = false;
              }
            }
          } else if(ev==="error"){
            // Handle error events from the stream
            let errorMsg = "An error occurred";
            if (typeof data === 'string') {
              errorMsg = data;
            } else if (data && typeof data === 'object') {
              // Extract error from nested structure
              if (data.error) {
                errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
              } else if (data.message) {
                errorMsg = data.message;
              } else {
                errorMsg = JSON.stringify(data);
              }
            }
            const currentMsgs = useChatStore.getState().conversations.find(c => c.id === newThreadId)?.messages || [];
            const lastMsg = currentMsgs[currentMsgs.length - 1];
            if(lastMsg && lastMsg.role === "assistant") {
              // Ensure we have a non-empty error message
              const displayError = errorMsg.trim() || "An error occurred";
              state.patchAssistant(`Error: ${displayError}`);
            } else {
              // If no assistant message exists, add one with the error
              state.add({ id: nanoid(), role: "assistant", content: `Error: ${errorMsg.trim() || "An error occurred"}` });
            }
            break;
          } else if(ev==="slow_start"){
            // optional: could show a subtle indicator; no UI beyond chip
          } else if(ev==="thinking_step"){
            // Handle thinking step event - add to thinking steps
            let content: string = "";
            let isNewStep = false;

            if (typeof data === 'string') {
              content = data;
            } else if (data && typeof data === 'object') {
              const dataObj = data as { content?: string; text?: string; new?: boolean };
              content = dataObj.content || dataObj.text || "";
              isNewStep = dataObj.new ?? false;
            }

            if (content.trim()) {
              if (isNewStep) {
                // Explicit new step marker
                state.addThinkingStep(content);
              } else {
                // Update existing step or create first one
                const currentSteps = useChatStore.getState().thinkingSteps;
                if (currentSteps.length === 0) {
                  state.addThinkingStep(content);
                } else {
                  state.updateLastThinkingStep(content);
                }
              }
            }
          } else if(ev==="sources"){
            // Handle sources event - add sources to the assistant message
            log.debug('[useChatStream] sources event received', { ev, data, dataType: typeof data });

            let sources: Array<{ title: string; host: string; url?: string; date?: string }> | null = null;

            if (data && typeof data === 'object' && data.sources) {
              sources = data.sources;
            } else if (data && typeof data === 'string') {
              try {
                const parsed = JSON.parse(data);
                sources = parsed.sources || null;
              } catch {
                log.warn('[useChatStream] Failed to parse sources data as JSON');
              }
            }

            if (sources && Array.isArray(sources) && sources.length > 0) {
              log.debug('[useChatStream] Injecting sources:', sources.length, sources);
              const currentMsgs = useChatStore.getState().conversations.find(c => c.id === newThreadId)?.messages || [];
              const lastMsg = currentMsgs[currentMsgs.length - 1];
              if(lastMsg && lastMsg.role === "assistant") {
                state.patchAssistant(lastMsg.content, sources);
              } else {
                log.warn('[useChatStream] No assistant message found to attach sources');
              }
            } else {
              log.warn('[useChatStream] sources event received but no valid sources found', { data, dataType: typeof data });
            }
          } else if(ev==="done"){
            // For image requests, wait for image generation to complete before breaking
            if (imageIntentDetected && imageGenerationPromise) {
              await imageGenerationPromise;
            }
            break;
          }
        }

        // After stream completes, check for artifact creation (only if not already handled)
        try {
          // Get final assistant message content
          const finalState = useChatStore.getState();
          const finalConv = finalState.conversations.find(c => c.id === newThreadId);
          const assistantMsg = finalConv?.messages.find(m => m.role === "assistant" && m.id === assistant.id);
          const responseContent = assistantMsg?.content || finalResponseText || "";

          log.info('[useChatStream] Checking for artifact creation', {
            threadId: newThreadId,
            userText: text.substring(0, 100),
            responseLength: responseContent.length,
            userId: userId || 'none',
          });

          // Phase 4: Use gatekeeper API for classification (if not already detected early)
          let intent: ArtifactIntent;
          const authToken = await getToken();
          if (imageIntentDetected && earlyImageIntent) {
            // Use the early detected intent
            intent = earlyImageIntent;
            log.info('[useChatStream] Using early detected image intent', {
              shouldCreate: intent.shouldCreate,
              type: intent.type,
              confidence: intent.confidence,
              userText: text.substring(0, 100),
            });
          } else {
            // Check again after stream completes (fallback)
            intent = userId && authToken
              ? await classifyArtifactIntentViaAPI(text, newThreadId, userId, authToken)
              : classifyArtifactIntent(text, responseContent);

            log.info('[useChatStream] Gatekeeper intent result', {
              shouldCreate: intent.shouldCreate,
              type: intent.type,
              confidence: intent.confidence,
              userText: text.substring(0, 100),
            });
          }

          if (intent.shouldCreate && intent.type === 'image') {
            // Image generation already handled earlier if imageIntentDetected
            if (!imageIntentDetected) {
              // Late detection - handle it here
              log.info('[useChatStream] Image intent detected (late). Creating image artifact.');
              // Note: This case shouldn't happen often since we detect early
              // But handle it for completeness
            }
          } else if (intent.shouldCreate && intent.type === "table") {
            // Extract table data from response
            const tableData = autoDetectTableFormat(responseContent);

            log.info('[useChatStream] Table parsing result', {
              tableDataFound: tableData.length > 0,
              rowCount: tableData.length,
              columnCount: tableData[0]?.length || 0,
              responsePreview: responseContent.substring(0, 500),
            });

            const firstRow = tableData[0];
            if (tableData.length > 0 && firstRow && firstRow.length > 0) {
              // Create table artifact with temp ID
              const artifactStore = useArtifactStore.getState();
              const artifact = artifactStore.createTableArtifact(tableData, newThreadId);

              log.info('[useChatStream] Artifact created locally', {
                artifactId: artifact.id,
                threadId: newThreadId,
                rows: tableData.length,
                columns: tableData[0]?.length || 0,
              });

              // Artifacts show inline in chat - scroll into view after creation
              console.log('[artifact] Created artifact (inline display)', artifact.id);
              
              // Scroll artifact card into view after a short delay to ensure DOM is ready
              setTimeout(() => {
                scrollArtifactIntoView(artifact.id);
              }, 300);
              
              // Phase 4: Save artifact to backend and update pointer
              // Note: saveArtifact() handles repointing internally, so we don't need to do it here
              if (authToken) {
                try {
                  const saved = await artifactStore.saveArtifact(artifact, authToken);
                  log.info('[useChatStream] Artifact saved to backend', { 
                    oldId: artifact.id, 
                    newId: saved?.id 
                  });
                  
                  // Repoint is handled in artifactStore.saveArtifact() - no need to duplicate here
                  if (saved?.id && saved.id !== artifact.id) {
                    console.log('[autoopen] repoint currentArtifact to serverId', saved.id);
                    // Scroll to new artifact ID after repoint
                    setTimeout(() => {
                      scrollArtifactIntoView(saved.id);
                    }, 100);
                  }
                } catch (saveError: any) {
                  log.error('[useChatStream] Failed to save artifact to backend', {
                    error: saveError?.message,
                    artifactId: artifact.id,
                  });
                  // Keep temp artifact selected; log only
                }
              } else {
                log.warn('[useChatStream] No auth token, skipping backend save');
              }

              // Log telemetry event (already logged in saveArtifact, but keep for backward compatibility)
              logEvent({
                event: "artifact_created",
                type: "table",
                artifactId: artifact.id,
                threadId: newThreadId,
                rowCount: tableData.length,
                columnCount: tableData[0]?.length || 0,
                confidence: intent.confidence,
              });

              log.info('[useChatStream] Created table artifact successfully', {
                artifactId: artifact.id,
                threadId: newThreadId,
                rows: tableData.length,
                columns: tableData[0]?.length || 0,
              });
            } else {
              log.warn('[useChatStream] Table intent detected but no valid table data found', {
                intent,
                responsePreview: responseContent.substring(0, 500),
                tableDataLength: tableData.length,
              });
            }
          } else {
            log.debug('[useChatStream] No artifact creation needed', {
              shouldCreate: intent.shouldCreate,
              type: intent.type,
            });
          }
        } catch (artifactError: any) {
          // Don't fail the entire stream if artifact creation fails
          log.error('[useChatStream] Failed to create artifact', {
            error: artifactError?.message,
            stack: artifactError?.stack,
            userText: text.substring(0, 100),
          });
        }
      } catch (err: unknown) {
        // Don't show error toast for aborted requests
        if (err instanceof Error && err.name === 'AbortError') {
          log.debug('[useChatStream] Request aborted');
        } else {
          handleApiError(err, {
            action: 'sending message',
            fallbackMessage: 'Failed to send message.',
          });
        }
      } finally {
        // Cleanup: abort all ongoing requests
        cleanup();
        
        // Wait for image generation to complete if it's still running
        if (imageGenerationPromise) {
          try {
            await Promise.race([
              imageGenerationPromise,
              new Promise((resolve) => setTimeout(resolve, 1000)), // 1s timeout
            ]);
          } catch {
            // Ignore errors during cleanup
          }
        }
        
        // Clear dots interval if still running
        if (dotsInterval) {
          clearInterval(dotsInterval);
        }
        state.end();
      }
    }
  };
}

