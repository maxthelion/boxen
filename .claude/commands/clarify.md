# Clarify Feature

Go through the clarification process for a feature awaiting clarification.

## Usage

```
/clarify [feature]
```

- No argument: List features awaiting clarification, ask which to work on
- With argument: Go directly to that feature (number or partial name match)

## Instructions

### 1. Select Feature

If no argument, list items in `project-management/awaiting-clarification/`:

```
## Features Awaiting Clarification

| # | Feature | Questions |
|---|---------|-----------|
| 1 | batch-fillet-corners | 7 questions, 7 answered |
| 2 | 2d-view-legend-polish | 4 questions, 0 answered |
...

Which feature to clarify?
```

### 2. Show Current State

Read the feature file and show:
- Summary of the feature
- Questions with their current status (answered/unanswered)
- For answered questions, show the answer briefly

### 3. Ask Unanswered Questions

For each unanswered question:
1. Present the question with its options
2. Wait for user response
3. Update the file with the answer (mark as **ANSWERED:** with the response)
4. Move to next question

### 4. Handle User Responses

- User can answer the current question
- User can say "skip" to move to next question
- User can say "done" to exit early
- User can provide additional context or ask for clarification

### 5. When All Questions Answered

- Update the file status to "Ready to Implement"
- Create a summary table of all decisions
- Update `current-priorities.md` to move feature to "Ready to Implement" section
- Inform user the feature is ready

### 6. Partial Sessions

If user exits before all questions answered:
- Save progress (answered questions stay answered)
- Status remains "Awaiting Clarification"
- User can resume later with `/clarify [feature]`

## Tips for Asking Questions

- Present one question at a time
- Show the options clearly
- If user's answer doesn't match an option exactly, interpret their intent
- If answer is ambiguous, ask for clarification
- For technical decisions, offer to create sensible defaults if user prefers

## Example Session

```
User: /clarify 2

Claude: ## 2D View Legend & Polish

**Summary:** Visual improvements to 2D panel editing view.

**Progress:** 0/4 questions answered

### Question 1: Legend placement

Where should the legend appear?
1. Fixed position in corner (like map legends)
2. Collapsible panel in sidebar
3. Tooltip on hover over elements
4. Other

User: 1, fixed in corner

Claude: Got it - legend fixed in corner.

### Question 2: "Forbidden areas"
...
```

## File Updates

When updating the clarification file:
- Change `- [ ] Option` to `**ANSWERED:** User's choice`
- Preserve the question text for context
- Add any additional notes from the discussion
