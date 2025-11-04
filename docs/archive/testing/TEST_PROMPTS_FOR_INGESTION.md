# Test Prompts for Ingestion Context

Use these prompts in the chat interface to test if ingested content is being retrieved and injected.

## Tech/Technology Queries

```
What's new in technology?
Latest tech news
Recent technology updates
What are the latest tech trends?
Technology developments
```

## Programming/Development Queries

```
What's trending on GitHub?
Latest GitHub projects
New programming tools
Recent developer news
Open source projects
```

## Science Queries

```
Latest science news
Recent scientific discoveries
What's new in science?
Science breakthroughs
```

## General Tech News

```
Tech industry news
Technology industry updates
What happened in tech today?
```

## Specific Source Tests

If you know specific titles from ingested content, try matching keywords:
```
Claude Code features
Pomelli
Visopsys
```

## What to Look For

When you send these queries, you should see in the response:

1. **Console logs** (browser console):
   ```
   [useChatStream] ingestion_context event received
   [useChatStream] Ingested context added to response
   ```

2. **In the chat UI**:
   - A message starting with "📚 Recent information from our knowledge base:"
   - Followed by numbered items with titles and summaries
   - Then the main LLM response

3. **Timing**:
   - The ingested context should appear **before** the main LLM response
   - It should be a separate event (not modifying the LLM call)

## Notes

- If you see "ingestion_context" events but no items, the query might not match any ingested content
- Try broader queries if specific ones don't work
- The ingested content is injected as a **separate event**, so it appears before the main response
- Main LLM response is unchanged - ingestion is supplementary

